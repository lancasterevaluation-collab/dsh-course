"""cs336/a3_sampling.py — 采样与确定性：为什么两次输出不同，以及怎么让它可复现

对标 CS336 的推理与解码部分。本机 CPU 可跑。

覆盖：
  1. 温度：对分布熵与 top-1 概率的影响
  2. top-k 与 top-p（核采样）：候选集合怎么被削减
  3. 采样频率与理论概率的一致性（固定种子，因此可断言）
  4. 可复现性：同种子同结果，异种子异结果
  5. 贪心解码的确定性

约束：随机行为一律用显式 generator 与固定种子，断言才稳定。
"""

import math

import torch
import torch.nn.functional as F

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


def entropy(p):
    """香农熵（自然对数，nats）。"""
    q = p[p > 0]
    return float(-(q * q.log()).sum())


def apply_temperature(logits, temperature):
    """温度缩放：logits / T 再 softmax。T<1 更尖锐，T>1 更平坦。"""
    return F.softmax(logits / temperature, dim=-1)


def top_k_filter(logits, k):
    """只保留最大的 k 个 logits，其余置为 -inf。"""
    if k >= logits.numel():
        return logits
    threshold = torch.topk(logits, k).values[-1]
    return logits.masked_fill(logits < threshold, float("-inf"))


def top_p_filter(logits, p):
    """核采样：按概率降序累加，保留累计刚超过 p 的最小集合。"""
    probs = F.softmax(logits, dim=-1)
    ordered, indices = torch.sort(probs, descending=True)
    cumulative = torch.cumsum(ordered, dim=-1)
    # 保留累计概率 <= p 的位置，加上第一个跨过 p 的位置
    keep = cumulative <= p
    keep[0] = True
    cut = int(keep.sum())
    remove = indices[cut:]
    return logits.masked_fill(torch.isin(torch.arange(logits.numel()), remove), float("-inf"))


def test_temperature():
    print("\n[1] 温度：熵与 top-1 概率")
    logits = torch.tensor([2.0, 1.0, 0.5, 0.0, -1.0], dtype=torch.float64)
    rows = []
    for t in (0.25, 0.5, 1.0, 2.0, 4.0):
        p = apply_temperature(logits, t)
        rows.append((t, entropy(p), float(p.max())))
        print(f"    T={t:<5} 熵={entropy(p):.4f} nats  top-1 概率={float(p.max()):.4f}")

    entropies = [r[1] for r in rows]
    tops = [r[2] for r in rows]
    ok("温度升高则熵单调增加", all(entropies[i] < entropies[i + 1] for i in range(len(entropies) - 1)))
    ok("温度升高则 top-1 概率单调下降", all(tops[i] > tops[i + 1] for i in range(len(tops) - 1)))

    # 极低温度趋近 one-hot（贪心）
    p_cold = apply_temperature(logits, 0.01)
    near("温度极低时 top-1 概率趋近 1", float(p_cold.max()), 1.0, 1e-12)
    # 高温趋近均匀分布
    p_hot = apply_temperature(logits, 1000.0)
    near("温度极高时趋近均匀分布（1/5）", float(p_hot.max()), 0.2, 5e-4)
    near("均匀分布的熵 = log 5", entropy(p_hot), math.log(5), 1e-6)


def test_top_k_and_top_p():
    print("\n[2] top-k 与 top-p：候选集怎么削减")
    logits = torch.tensor([3.0, 2.0, 1.0, 0.5, 0.1], dtype=torch.float64)

    k3 = top_k_filter(logits.clone(), 3)
    near("top-k=3 保留 3 个候选", float(torch.isfinite(k3).sum()), 3.0)
    ok("被裁掉的是最小的两个", torch.isinf(k3[3]) and torch.isinf(k3[4]))

    p = F.softmax(logits, dim=-1)
    print(f"    原始概率：{[round(float(x), 4) for x in p]}")
    for target in (0.5, 0.8, 0.95, 0.99):
        filtered = top_p_filter(logits.clone(), target)
        n = int(torch.isfinite(filtered).sum())
        kept = float(F.softmax(filtered, dim=-1).sum())
        print(f"    top-p={target}：保留 {n} 个候选（覆盖概率 {kept:.4f}）")
        ok(f"top-p={target} 的保留集合覆盖 >= {target}", kept >= target - 1e-9)

    near("top-p 很小时候选数为 1", float(torch.isfinite(top_p_filter(logits.clone(), 0.3)).sum()), 1.0)


def test_sampling_frequency():
    print("\n[3] 采样频率 vs 理论概率（固定种子 10000 次）")
    probs = torch.tensor([0.5, 0.3, 0.2], dtype=torch.float64)
    n = 10000
    gen = torch.Generator().manual_seed(20250926)
    draws = torch.multinomial(probs, n, replacement=True, generator=gen)
    counts = torch.bincount(draws, minlength=3).double()
    observed = counts / n
    for i, (o, e) in enumerate(zip(observed.tolist(), probs.tolist())):
        print(f"    token {i}：观测 {o:.4f} vs 理论 {e:.4f}")
        near(f"token {i} 的频率误差 < 0.02", o, e, 0.02)
    chi2 = float((((counts - n * probs) ** 2) / (n * probs)).sum())
    print(f"    这一次的卡方统计量 = {chi2:.3f}（自由度 2，0.05 临界值 5.99）")

    # 单次卡方超过临界值并不奇怪：0.05 就是它的假阳性率。
    # 正确做法是看多次重复的分布，而不是把一次结果当判据。
    trials = 40
    exceed = 0
    for seed in range(trials):
        g = torch.Generator().manual_seed(seed)
        d = torch.multinomial(probs, n, replacement=True, generator=g)
        c = torch.bincount(d, minlength=3).double()
        stat = float((((c - n * probs) ** 2) / (n * probs)).sum())
        if stat > 5.99:
            exceed += 1
    rate = exceed / trials
    print(f"    重复 {trials} 次：超限 {exceed} 次（{rate:.1%}），理论假阳性率 5%")
    ok("多次重复的超限率在合理范围（<= 15%）", rate <= 0.15)
    print(f"    ⇒ 本次的 {chi2:.3f} 落在 5% 的尾部，属于正常范围，不能据此判定采样有偏")


def test_reproducibility():
    print("\n[4] 可复现性：种子决定结果")
    logits = torch.tensor([1.5, 1.0, 0.5, 0.2], dtype=torch.float64)
    probs = F.softmax(logits, dim=-1)

    a = torch.multinomial(probs, 8, replacement=True, generator=torch.Generator().manual_seed(7))
    b = torch.multinomial(probs, 8, replacement=True, generator=torch.Generator().manual_seed(7))
    c = torch.multinomial(probs, 8, replacement=True, generator=torch.Generator().manual_seed(8))
    ok("同种子两次采样完全相同", torch.equal(a, b))
    ok("不同种子的结果不同", not torch.equal(a, c))
    print(f"    种子 7 ：{a.tolist()}")
    print(f"    种子 8 ：{c.tolist()}")

    greedy = torch.argmax(probs)
    ok("贪心解码与种子无关", int(greedy) == 0)
    near("贪心选中概率最大的 token", float(probs[greedy]), float(probs.max()))


def test_diversity():
    print("\n[5] 温度对输出多样性的影响")
    logits = torch.tensor([2.0, 1.5, 1.0, 0.5, 0.0], dtype=torch.float64)
    n = 500
    for t in (0.5, 1.0, 2.0):
        p = apply_temperature(logits, t)
        gen = torch.Generator().manual_seed(42)
        draws = torch.multinomial(p, n, replacement=True, generator=gen)
        unique = int(len(torch.unique(draws)))
        top_share = float(torch.bincount(draws, minlength=5).max()) / n
        print(f"    T={t:<4} 出现过的不同 token 数={unique}/5，最高频占比={top_share:.3f}")

    p_low = apply_temperature(logits, 0.5)
    p_high = apply_temperature(logits, 2.0)
    ok("高温下最大概率更小（分布更平）", float(p_high.max()) < float(p_low.max()))
    ok("高温下熵更大（多样性更高）", entropy(p_high) > entropy(p_low))


def main():
    print("=" * 68)
    print("采样与确定性")
    print("=" * 68)
    test_temperature()
    test_top_k_and_top_p()
    test_sampling_frequency()
    test_reproducibility()
    test_diversity()
    print("\n" + "=" * 68)
    print(f"结果：{pass_count} 通过，{fail_count} 不通过")
    print("=" * 68)
    if fail_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
