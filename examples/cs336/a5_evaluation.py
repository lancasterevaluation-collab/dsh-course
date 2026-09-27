"""cs336/a5_evaluation.py — 能力评测：分辨率、样本量与污染

对标 CS336 的评测部分。本机 CPU 可跑。

覆盖：
  1. 置信区间：n 个样本能把准确率定到多准（Wilson 区间）
  2. 分辨率下限：这个样本量能分辨多大的差异
  3. 样本量公式：要检出 4 个百分点的提升，需要多少样本
  4. 污染效应：测试样本落进训练数据后，测得的分会虚高多少
  5. 不平衡的陷阱：多数类基线下的准确率与 F1
  6. 噪声下限：同配置两次运行的差异分布

约束：随机部分用固定种子；区间与样本量用解析公式，可精确断言。
"""

import math

import torch

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


Z95 = 1.959963985


def wilson_interval(successes, n, z=Z95):
    """Wilson 置信区间：比正态近似更稳，小样本与极端比例下也可用。"""
    if n == 0:
        return 0.0, 1.0
    p = successes / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, center - half), min(1.0, center + half)


def required_sample_size(p1, p2, alpha_z=Z95, power_z=0.8416):
    """检出两个比例之间的差异所需样本量（每组）。

    n = (z_{a/2} + z_b)^2 * (p1(1-p1) + p2(1-p2)) / (p1-p2)^2
    """
    return (alpha_z + power_z) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2)) / (p1 - p2) ** 2


def contaminated_accuracy(clean_acc, contamination_rate, contaminated_acc=1.0):
    """混合了被污染样本之后测得的准确率。

    污染样本上模型"见过答案"，因此准确率取 contaminated_acc。
    """
    return (1 - contamination_rate) * clean_acc + contamination_rate * contaminated_acc


def test_resolution():
    print("\n[1] 置信区间：样本量决定分辨率")
    p = 0.7
    rows = []
    for n in (100, 400, 1000, 4000, 16000):
        lo, hi = wilson_interval(int(p * n), n)
        width = hi - lo
        rows.append((n, lo, hi, width))
        print(f"    n={n:>6}  准确率 {p:.2f}  95% 区间 [{lo:.4f}, {hi:.4f}]  宽度 {width:.4f}")

    widths = [r[3] for r in rows]
    ok("区间宽度随样本量单调收窄", all(widths[i] > widths[i + 1] for i in range(len(widths) - 1)))
    near("样本量翻 4 倍，宽度约减半", widths[0] / widths[1], 2.0, 0.25)
    print(f"    ⇒ n=100 的区间宽 {widths[0]:.3f}，n=16000 只有 {widths[-1]:.3f}（约 1/sqrt(n)）")

    # 分辨率的直接含义：区间宽度就是"看不错"的最小差异
    ok("小样本下区间宽度超过 10 个百分点", widths[0] > 0.10)
    ok("大样本下区间宽度小于 2 个百分点", widths[-1] < 0.02)


def test_sample_size():
    print("\n[2] 样本量：要检出多大的提升")
    for p1, p2 in ((0.70, 0.74), (0.70, 0.72), (0.70, 0.90)):
        n = required_sample_size(p1, p2)
        print(f"    {p1:.0%} → {p2:.0%}（提升 {(p2 - p1) * 100:.0f} 个百分点）需要每组 {math.ceil(n)} 个样本")

    n4 = math.ceil(required_sample_size(0.70, 0.74))
    n2 = math.ceil(required_sample_size(0.70, 0.72))
    ok("检出的差异越小，需要的样本越多", n2 > n4)
    ok("检出 4 个百分点需要近两千样本", 1500 < n4 < 2500)
    print(f"    ⇒ 只要 4 个百分点的提升，就需要约 {n4} 个样本——这就是「小评测集不可信」的定量原因")


def test_contamination():
    print("\n[3] 污染：分数被抬高多少")
    clean = 0.70
    print(f"    {'污染率':>8} {'测得准确率':>12} {'虚高':>10}")
    for rate in (0.0, 0.05, 0.10, 0.25):
        measured = contaminated_accuracy(clean, rate)
        print(f"    {rate:>8.0%} {measured:>12.4f} {measured - clean:>10.4f}")

    near("污染率 10% 时测得 0.73", contaminated_accuracy(clean, 0.10), 0.73)
    near("污染率 25% 时测得 0.775", contaminated_accuracy(clean, 0.25), 0.775)
    near("无污染时测得真实值", contaminated_accuracy(clean, 0.0), clean)

    # 关键：污染造成的虚高可能超过"被评测的改动效应"
    lift = 0.73 - 0.70
    ok("10% 污染的虚高量级与 3 个百分点的改动相当", abs(lift - 0.03) < 1e-9)
    print(f"    ⇒ 10% 污染造成的 {lift:.2%} 虚高，与「一次有效优化」的提升同量级")


def test_imbalance():
    print("\n[4] 不平衡：高准确率可以什么都没做")
    n, positive_rate = 1000, 0.90
    n_pos = int(n * positive_rate)
    n_neg = n - n_pos
    print(f"    数据集：{n} 条，正类 {n_pos} 条（{positive_rate:.0%}），负类 {n_neg} 条")

    # 全预测为正类
    acc = n_pos / n
    tp, fp, fn = n_pos, n_neg, 0
    precision = tp / (tp + fp)
    recall = tp / (tp + fn)
    f1 = 2 * precision * recall / (precision + recall)
    balanced = (recall + 0.0) / 2  # 负类召回为 0
    print(f"    全预测正类：准确率 {acc:.2f}  精确率 {precision:.2f}  召回率 {recall:.2f}  "
          f"F1 {f1:.2f}  均衡准确率 {balanced:.2f}")
    near("多数类基线准确率 = 正类占比", acc, positive_rate)
    near("全预测正类时负类召回为零，均衡准确率 = 0.5", balanced, 0.5)
    ok("F1 在不平衡数据上同样虚高（0.95 甚至高于准确率 0.90）", f1 > acc)
    ok("唯有均衡准确率暴露了问题（0.50 = 随机水平）", abs(balanced - 0.5) < 1e-9)
    print("    ⇒ 准确率与 F1 都会骗人：一个什么都没做的模型，两项指标都很好看，"
          "只有均衡准确率停在随机水平")


def test_noise_floor():
    print("\n[5] 噪声下限：同配置两次运行差多少")
    n, true_acc = 400, 0.72
    gen = torch.Generator().manual_seed(20260101)
    runs = []
    for _ in range(20):
        draws = torch.rand(n, generator=gen)
        runs.append(float((draws < true_acc).double().mean()))
    diffs = [abs(runs[i] - runs[i + 1]) for i in range(0, len(runs) - 1, 2)]
    mean_diff = sum(diffs) / len(diffs)
    print(f"    同配置跑 20 次：均值 {sum(runs) / len(runs):.4f}，"
          f"最小 {min(runs):.4f}，最大 {max(runs):.4f}")
    print(f"    配对差值的均值 = {mean_diff:.4f}（这就是这次评测的噪声下限）")

    theoretical = math.sqrt(2 * true_acc * (1 - true_acc) / n)
    print(f"    理论标准差差 = sqrt(2p(1-p)/n) = {theoretical:.4f}")
    near("经验噪声下限与理论量级一致", mean_diff, theoretical, 0.02)

    n4 = math.ceil(required_sample_size(0.70, 0.74))
    print(f"    ⇒ n={n} 时噪声下限约 {mean_diff:.1%}，而你要检出的提升是 4 个百分点——")
    print(f"      这就是为什么 4 个百分点的结论需要约 {n4} 个样本，而不是 400 个")
    ok("400 个样本的噪声下限超过 2 个百分点", mean_diff > 0.02)


def main():
    print("=" * 68)
    print("能力评测：分辨率、样本量与污染")
    print("=" * 68)
    test_resolution()
    test_sample_size()
    test_contamination()
    test_imbalance()
    test_noise_floor()
    print("\n" + "=" * 68)
    print(f"结果：{pass_count} 通过，{fail_count} 不通过")
    print("=" * 68)
    if fail_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
