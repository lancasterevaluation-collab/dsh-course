"""cs336/a2_alignment.py — 预训练 / 微调 / 对齐：三种改变模型行为的手段

对标 CS336 的 post-training 部分。本机 CPU 可跑。

覆盖：
  1. SFT：损失只算在回答上（prompt 部分被掩码掉）
  2. DPO：偏好损失与隐式奖励，以及"策略等于参考时损失 = log 2"这条恒等式
  3. LoRA：可训练参数量与全量微调的对比
  4. scaling law：用合成数据拟合幂律，验证能恢复出指数

约束：断言只用确定性的量；随机初始化一律固定种子。
"""

import math

import torch
import torch.nn.functional as F

torch.manual_seed(0)

pass_count = 0
fail_count = 0


def ok(name, cond):
    global pass_count, fail_count
    if cond:
        pass_count += 1
        print(f"  [通过] {name}")
    else:
        fail_count += 1
        print(f"  [失败] {name}")


def near(name, a, b, tol=1e-6):
    diff = float(abs(a - b))
    ok(f"{name}（|{diff:.3e}| <= {tol:g}）", diff <= tol)
    return diff <= tol


# ---------------------------------------------------------------- 1. SFT 掩码


def sft_loss(logits, targets, mask):
    """只在 mask 为真的位置计算交叉熵。

    logits:(B,T,V) targets:(B,T) mask:(B,T) bool
    """
    per_token = F.cross_entropy(
        logits.reshape(-1, logits.size(-1)), targets.reshape(-1), reduction="none"
    )
    m = mask.reshape(-1)
    return (per_token * m).sum() / m.sum()


def test_sft_masking():
    print("\n[1] SFT：损失只算在回答上")
    b, t, v = 2, 6, 11
    logits = torch.randn(b, t, v)
    targets = torch.randint(0, v, (b, t))
    mask = torch.zeros(b, t, dtype=torch.bool)
    mask[:, 3:] = True  # 前 3 个位置是 prompt

    base = sft_loss(logits, targets, mask)

    # 改动被掩码的位置（prompt 段的 logits），损失不应变化
    logits2 = logits.clone()
    logits2[:, :3] = torch.randn(b, 3, v)
    near("改 prompt 段的 logits，损失不变", sft_loss(logits2, targets, mask), base)

    # 改动回答段则损失必须变
    logits3 = logits.clone()
    logits3[:, 3:] = torch.randn(b, 3, v)
    ok("改回答段的 logits，损失改变", abs(float(sft_loss(logits3, targets, mask) - base)) > 1e-6)

    # 全掩码与部分掩码的差别
    full_mask = torch.ones(b, t, dtype=torch.bool)
    ok("只在回答上算的损失与全文损失不同", abs(float(sft_loss(logits, targets, full_mask) - base)) > 1e-6)
    print(f"    回答位 6 个的真实损失 = {float(base):.4f}")


# ---------------------------------------------------------------- 2. DPO


def dpo_loss(policy_w, policy_l, ref_w, ref_l, beta=0.1):
    """DPO 损失：对 (胜出, 落败) 成对样本取平均。

    隐式奖励 r(x,y) = beta * (log pi(y|x) - log pi_ref(y|x))
    损失 = -log sigmoid(r_w - r_l)
    """
    margin = beta * ((policy_w - ref_w) - (policy_l - ref_l))
    return -F.logsigmoid(margin).mean()


def dpo_implicit_reward(policy_logp, ref_logp, beta=0.1):
    """隐式奖励：可直接用于比较两个回答的好坏。"""
    return beta * (policy_logp - ref_logp)


def test_dpo():
    print("\n[2] DPO：偏好损失与隐式奖励")
    # 策略与参考完全相同 ⇒ margin = 0 ⇒ 损失 = -log sigmoid(0) = log 2
    z = torch.zeros(8)
    near("策略=参考时损失 = log 2", float(dpo_loss(z, z, z, z)), math.log(2), 1e-6)

    # 参考项为 0、策略偏好胜出答案 ⇒ 损失应小于 log 2
    w = torch.full((4,), 1.0)
    l = torch.zeros(4)
    loss_good = float(dpo_loss(w, l, z[:4], z[:4], beta=0.5))
    ok("偏好正确时损失小于 log 2", loss_good < math.log(2))
    ok("偏好错误时损失大于 log 2", float(dpo_loss(l, w, z[:4], z[:4], beta=0.5)) > math.log(2))

    # beta 越大，同一组对数概率差的惩罚越强
    small = float(dpo_loss(w, l, z[:4], z[:4], beta=0.1))
    large = float(dpo_loss(w, l, z[:4], z[:4], beta=1.0))
    ok("beta 越大损失越小（同向偏好更强）", large < small)

    # 隐式奖励的差 == 损失的 margin
    rw = dpo_implicit_reward(torch.tensor(2.0), torch.tensor(0.5), beta=0.5)
    rl = dpo_implicit_reward(torch.tensor(0.5), torch.tensor(0.5), beta=0.5)
    near("隐式奖励差 = beta*(Δlogp)", float(rw - rl), 0.5 * (2.0 - 0.5))
    print(f"    log 2 = {math.log(2):.6f}；偏好正确（beta=0.5）损失 = {loss_good:.6f}")


# ---------------------------------------------------------------- 3. LoRA


def lora_params(d_model, r):
    """每层的 LoRA 可训练参数量：A(r,d) + B(d,r)。"""
    return r * d_model + d_model * r


def full_params(d_model):
    """全量微调时该层的可训练参数量。"""
    return d_model * d_model


def test_lora():
    print("\n[3] LoRA：可训练参数量")
    d, r = 4096, 16
    lo, fu = lora_params(d, r), full_params(d)
    ratio = lo / fu
    print(f"    d={d} r={r}：LoRA {lo:,} vs 全量 {fu:,}（{ratio:.4%}）")
    ok("LoRA = 2*r*d", lo == 2 * r * d)
    ok("LoRA 占比 = 2r/d", abs(ratio - 2 * r / d) < 1e-12)
    ok("LoRA 比全量小两个数量级以上", ratio < 0.01)

    # 层数放大到 32 层
    layers = 32
    print(f"    32 层：LoRA {(lo * layers) / 1e6:.1f}M 可训练 vs 全量 {(fu * layers) / 1e6:.0f}M")
    ok("参数量按层数线性放大", lo * layers == 2 * r * d * layers)
    ok("r 翻倍则 LoRA 参数量翻倍", lora_params(d, 2 * r) == 2 * lo)


# ---------------------------------------------------------------- 4. scaling law


def make_scaling_data(a, b, c, sizes):
    """合成的缩放关系 L(N) = a * N^(-b) + c（无噪声，便于验证拟合方法）。"""
    return [a * (n ** (-b)) + c for n in sizes]


def fit_power_law_naive(sizes, losses):
    """朴素做法：先把最小损失乘以 0.9 当常数扣掉，再对 log 做线性回归。

    这是常见但**不可靠**的做法——常数项一旦估偏，剩下的曲线会被它压平，
    拟合出的指数会明显偏小。保留它是为了和正确做法对照。
    """
    c0 = min(losses) * 0.9
    xs = [math.log(n) for n in sizes]
    ys = [math.log(l - c0) for l in losses]
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return -slope


def fit_power_law(sizes, losses, iters=3000, lr=0.05):
    """正确做法：同时对 a、b、c 做非线性最小二乘（用梯度下降）。

    参数化时对 a、b 取 log，保证它们始终为正。
    返回 (a, b, c)，对应 L(N) = a * N^(-b) + c。
    """
    n_tensor = torch.tensor(sizes, dtype=torch.float64)
    target = torch.tensor(losses, dtype=torch.float64)
    log_a = torch.tensor(math.log(1.0), dtype=torch.float64, requires_grad=True)
    log_b = torch.tensor(math.log(0.5), dtype=torch.float64, requires_grad=True)
    c = torch.tensor(0.0, dtype=torch.float64, requires_grad=True)
    opt = torch.optim.Adam([log_a, log_b, c], lr=lr)
    for _ in range(iters):
        opt.zero_grad()
        pred = log_a.exp() * n_tensor.pow(-log_b.exp()) + c
        ((pred - target) ** 2).mean().backward()
        opt.step()
    return float(log_a.exp()), float(log_b.exp()), float(c)


def test_scaling_law():
    print("\n[4] scaling law：从数据里恢复指数")
    true_a, true_b, true_c = 3.0, 0.35, 1.2
    sizes = [10 ** k for k in range(3, 9)]
    losses = make_scaling_data(true_a, true_b, true_c, sizes)
    for n, l in zip(sizes, losses):
        print(f"    N={n:>9}  L={l:.4f}")

    est_b = fit_power_law_naive(sizes, losses)
    print(f"    朴素法（先扣常数再线性回归）拟合 b = {est_b:.4f}，偏差 {abs(est_b - true_b) / true_b:.1%}")
    ok("朴素法明显低估指数（这正是它不可靠的证据）", abs(est_b - true_b) / true_b > 0.5)

    est_a, est_b2, est_c = fit_power_law(sizes, losses)
    print(f"    三参数法拟合：a={est_a:.4f} b={est_b2:.4f} c={est_c:.4f}"
          f"（真实 a={true_a} b={true_b} c={true_c}）")
    ok("三参数法的指数误差 < 5%", abs(est_b2 - true_b) / true_b < 0.05)
    near("三参数法恢复不可约损失 c", est_c, true_c, 0.05)

    # 规模翻倍带来的损失下降是递减的
    d1 = losses[0] - losses[1]
    d2 = losses[-2] - losses[-1]
    ok("收益随规模递减", d1 > d2)
    print(f"    10^3→10^4 降 {d1:.4f}，10^7→10^8 只降 {d2:.4f}")

    # 常数项 c 是"不可约损失"：规模再大也降不到它下面
    ok("所有损失都大于不可约部分 c", all(l > true_c for l in losses))


def main():
    print("=" * 68)
    print("预训练 / 微调 / 对齐：三种改变模型行为的手段")
    print("=" * 68)
    test_sft_masking()
    test_dpo()
    test_lora()
    test_scaling_law()
    print("\n" + "=" * 68)
    print(f"结果：{pass_count} 通过，{fail_count} 不通过")
    print("=" * 68)
    if fail_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
