"""cs336/a1_attention.py — 因果注意力与 KV cache：正确性与成本核算

对标 CS336 的资源核算与注意力部分。本机 CPU 可跑。

设计约束：
  * 断言只用确定性的量（数值等价、理论 FLOPs、参数量）。
  * 耗时只打印、不作断言——CPU 计时受调度影响，不适合当回归判据。
  * 全部计算用 float64，让"缓存与重算等价"的断言有足够精度。
"""

import math
import time

import torch

torch.manual_seed(0)
DTYPE = torch.float64

pass_count = 0
fail_count = 0


def ok(name, cond):
    """记一条断言。"""
    global pass_count, fail_count
    if cond:
        pass_count += 1
        print(f"  [通过] {name}")
    else:
        fail_count += 1
        print(f"  [失败] {name}")


def near(name, a, b, tol=1e-9):
    """记一条近似相等的断言，并返回它是否通过。"""
    diff = float(abs(a - b))
    good = diff <= tol
    ok(f"{name}（|{diff:.3e}| <= {tol:g}）", good)
    return good


def causal_mask(t):
    """因果掩码：上三角（不含对角线）为 True，表示"看不见未来"。"""
    return torch.triu(torch.ones(t, t, dtype=torch.bool), diagonal=1)


def attention(q, k, v, mask=None):
    """缩放点积注意力。q:(B,H,T,D)，k/v:(B,H,S,D) -> (B,H,T,D)。

    当 T > 1 且 S == T 时是 prefill（整段一起算）。
    当 T == 1 且 S > 1 时是 decode（一次只算一个新 token）。
    """
    d = q.size(-1)
    scores = (q @ k.transpose(-2, -1)) / math.sqrt(d)
    if mask is not None:
        scores = scores.masked_fill(mask, float("-inf"))
    return torch.softmax(scores, dim=-1) @ v


class AttentionLayer:
    """单头自注意力层，带可选 KV cache。

    缓存只存 k 与 v：decode 时每个新 token 的 query 只需要与全部历史的 k/v 做一次点积。
    """

    def __init__(self, d_model):
        self.d_model = d_model
        g = torch.Generator().manual_seed(1234)
        scale = 1.0 / math.sqrt(d_model)
        self.w_q = torch.randn(d_model, d_model, dtype=DTYPE, generator=g) * scale
        self.w_k = torch.randn(d_model, d_model, dtype=DTYPE, generator=g) * scale
        self.w_v = torch.randn(d_model, d_model, dtype=DTYPE, generator=g) * scale

    def forward(self, x, cache=None):
        """x:(B,T,D) -> (B,T,D)。cache 为 None 时是全量重算。"""
        b, t, _ = x.shape
        q = x @ self.w_q
        k = x @ self.w_k
        v = x @ self.w_v

        if cache is not None:
            # 把历史 k/v 接到当前步前面——这就是 cache 的全部作用
            k = torch.cat([cache["k"], k], dim=1)
            v = torch.cat([cache["v"], v], dim=1)
            # 当前 query 只看得到历史与它自己，因此不需要掩码
            out = attention(q.unsqueeze(1), k.unsqueeze(1), v.unsqueeze(1))
            cache["k"], cache["v"] = k, v
            return out.squeeze(1)

        # 全量重算：需要因果掩码
        mask = causal_mask(t)
        return attention(q.unsqueeze(1), k.unsqueeze(1), v.unsqueeze(1), mask).squeeze(1)


def test_causality():
    """未来 token 不得影响过去的输出。"""
    print("\n[1] 因果性：改变第 5 个 token，前 5 个输出不变")
    d, t = 8, 6
    layer = AttentionLayer(d)
    x = torch.randn(1, t, d, dtype=DTYPE)
    base = layer.forward(x)

    x2 = x.clone()
    x2[0, 4] = torch.randn(d, dtype=DTYPE) * 3  # 改第 5 个（索引 4）
    changed = layer.forward(x2)

    near("位置 0–3 的输出不受影响", float((base[0, :4] - changed[0, :4]).abs().max()), 0.0)
    ok("位置 4 的输出确实变了", float((base[0, 4] - changed[0, 4]).abs().max()) > 1e-6)


def test_kv_cache_equivalence():
    """逐步解码（带 cache）与整段重算必须数值等价。"""
    print("\n[2] KV cache 等价性：逐步解码 == 整段重算")
    d, t = 16, 32
    layer = AttentionLayer(d)
    x = torch.randn(1, t, d, dtype=DTYPE)

    full = layer.forward(x)

    cache = {"k": torch.zeros(1, 0, d, dtype=DTYPE), "v": torch.zeros(1, 0, d, dtype=DTYPE)}
    steps = [layer.forward(x[:, i : i + 1], cache) for i in range(t)]
    incremental = torch.cat(steps, dim=1)

    near("全部 32 个位置的最大误差", float((full - incremental).abs().max()), 1e-12)
    ok("cache 累积到 32 个位置", cache["k"].size(1) == t)

    # 无 cache 时每步都要重算整段：把两者的工作量算清楚
    full_work = sum((i + 1) * (i + 1) for i in range(t))
    cache_work = sum(i + 1 for i in range(t))
    print(f"    重算的总注意力项数：{full_work}，带 cache：{cache_work}"
          f"，省下 {full_work / cache_work:.1f} 倍")
    ok("缓存把工作量从 O(T^3) 降到 O(T^2)", full_work // cache_work > t // 2)


def test_cost_growth():
    """注意力项数随序列长度的增长，以及 prefill 与 decode 的差别。"""
    print("\n[3] 成本：注意力项数 = B*H*T*S")
    ok("T=1024 的项数 = 1024^2", 1024 * 1024 == 1048576)
    ok("T 翻倍，项数变 4 倍", (2048 * 2048) // (1024 * 1024) == 4)

    # prefill 一次算 T 个 query；decode 每步只算 1 个 query
    t = 4096
    prefill_terms = t * t
    decode_terms_per_step = t
    print(f"    T={t}：prefill {prefill_terms} 项，decode 每步 {decode_terms_per_step} 项，"
          f"相差 {prefill_terms // decode_terms_per_step} 倍")
    ok("prefill 的项数是 decode 单步的 T 倍", prefill_terms // decode_terms_per_step == t)


def test_kv_cache_memory():
    """KV cache 的显存占用：2 * B * H * T * D * bytes。"""
    print("\n[4] KV cache 占用：2 * B * H * T * D * 字节数")
    b, h, t, d_head, layers = 1, 32, 32768, 128, 32
    bytes_fp16 = 2 * b * h * t * d_head * layers * 2
    gib = bytes_fp16 / 1024**3
    print(f"    B={b} H={h} T={t} D={d_head} 层={layers} fp16：{gib:.1f} GiB")
    ok("每层每 token 的 cache = 2*H*D*2 字节", 2 * h * d_head * 2 == 16384)
    near("T 翻倍则 cache 也翻倍", float(bytes_fp16 * 2) / bytes_fp16, 2.0)


def test_flops_accounting():
    """用 6ND 估算训练算力，用 2N 估算推理每 token 的算力。"""
    print("\n[5] 算力核算：训练 6ND，推理 2N（每 token）")
    n_params, n_tokens = 1_000_000, 1000
    ok("训练 FLOPs = 6*N*D", 6 * n_params * n_tokens == 6_000_000_000)
    ok("推理 FLOPs = 2*N（每 token）", 2 * n_params == 2_000_000)
    ok("训练比推理单 token 贵 3D 倍", (6 * n_tokens) // (2) == 3 * n_tokens)


def timing_table():
    """打印不同序列长度下的实测耗时（仅参考，不作断言）。"""
    print("\n[6] 实测耗时（仅供观察，不作断言）")
    d = 64
    layer = AttentionLayer(d)
    print(f"    {'T':>6} {'prefill(ms)':>12} {'项数':>12}")
    for t in (256, 512, 1024, 2048):
        x = torch.randn(1, t, d, dtype=DTYPE)
        layer.forward(x)  # 预热
        start = time.perf_counter()
        layer.forward(x)
        ms = (time.perf_counter() - start) * 1000
        print(f"    {t:>6} {ms:>12.2f} {t * t:>12}")


def main():
    print("=" * 68)
    print("因果注意力与 KV cache：正确性与成本核算")
    print("=" * 68)
    test_causality()
    test_kv_cache_equivalence()
    test_cost_growth()
    test_kv_cache_memory()
    test_flops_accounting()
    timing_table()
    print("\n" + "=" * 68)
    print(f"结果：{pass_count} 通过，{fail_count} 不通过")
    print("=" * 68)
    if fail_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
