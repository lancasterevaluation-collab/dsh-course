"""cs336/a4_inference_cost.py — 推理的成本结构：延迟、吞吐与显存

对标 CS336 的推理部分。本机 CPU 可跑。

覆盖：
  1. 延迟分解：首 token（prefill）与每 token（decode）
  2. 批处理：吞吐随批大小增长，但每请求延迟也变差
  3. 显存分解：权重 + KV cache，以及并发上限
  4. 成本公式：输入 / 输出 / 缓存命中三档计价
  5. 缓存的收益：前缀复用能省多少

约束：理论量（项数、字节数、金额）用于断言；实测耗时只打印。
"""

import time

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


def weights_gib(n_params, bytes_per_param=2):
    """模型权重的显存占用（GiB）。"""
    return n_params * bytes_per_param / 1024**3


def kv_cache_gib(batch, heads, seq, head_dim, layers, bytes_per_elem=2):
    """KV cache 的显存占用（GiB）：2 * B * H * T * D * 层数 * 每元素字节。"""
    return 2 * batch * heads * seq * head_dim * layers * bytes_per_elem / 1024**3


def max_concurrency(vram_gib, n_params, heads, seq, head_dim, layers, reserve_gib=2.0):
    """在给定显存下，能并发多少条同长度请求。"""
    free = vram_gib - weights_gib(n_params) - reserve_gib
    if free <= 0:
        return 0
    return int(free // kv_cache_gib(1, heads, seq, head_dim, layers))


def request_cost(input_tokens, output_tokens, cached_tokens, price_in, price_out, price_cached):
    """一次请求的价钱：输入、输出、缓存命中三档分别计价。"""
    return input_tokens * price_in + output_tokens * price_out + cached_tokens * price_cached


def test_latency_breakdown():
    print("\n[1] 延迟分解：prefill 与 decode 的项数比")
    heads, head_dim, layers = 8, 32, 4
    for seq in (512, 2048):
        prefill_terms = heads * layers * seq * seq
        decode_terms = heads * layers * 1 * seq
        print(f"    T={seq:<5} prefill 项数={prefill_terms:>12,}  decode 每步={decode_terms:>9,}"
              f"  比值={prefill_terms // decode_terms}")
        ok(f"T={seq} 时 prefill 与单步 decode 差 T 倍",
           prefill_terms // decode_terms == seq)

    # 实测（只打印）：首 token 与后续 token 的耗时对比
    d = 256
    w = torch.randn(d, d, dtype=torch.float32)
    x_long = torch.randn(1, 1024, d)
    x_one = torch.randn(1, 1, d)
    x_long @ w  # 预热
    t0 = time.perf_counter(); _ = x_long @ w; prefill_ms = (time.perf_counter() - t0) * 1000
    t0 = time.perf_counter(); _ = x_one @ w; decode_ms = (time.perf_counter() - t0) * 1000
    print(f"    实测：1024 个位置一次算 {prefill_ms:.3f} ms，单个位置 {decode_ms:.3f} ms"
          f"（每位置成本反而更省，因为并行度高）")
    ok("prefill 的每 token 成本低于 decode", prefill_ms / 1024 < decode_ms)


def test_batching():
    print("\n[2] 批处理：吞吐与延迟的权衡")
    d, reps = 1024, 30
    w = torch.randn(d, d, dtype=torch.float32)
    print(f"    矩阵 {d}x{d}，每次配置重复 {reps} 次取中位数（单次测量噪声太大）")
    print(f"    {'batch':>6} {'中位耗时(ms)':>13} {'吞吐(token/s)':>15} {'每请求延迟(ms)':>16}")
    rows = []
    for b in (1, 2, 4, 8, 16):
        x = torch.randn(b, d)
        x @ w  # 预热
        times = []
        for _ in range(reps):
            t0 = time.perf_counter()
            x @ w
            times.append((time.perf_counter() - t0) * 1000)
        ms = sorted(times)[reps // 2]
        throughput = b / (ms / 1000)
        rows.append((b, ms, throughput))
        print(f"    {b:>6} {ms:>13.3f} {throughput:>15.0f} {ms:>16.3f}")

    ok("批越大吞吐越高（首尾对比）", rows[-1][2] > rows[0][2])
    ok("批越大每请求延迟越高", rows[-1][1] > rows[0][1])
    print(f"    ⇒ 吞吐从 {rows[0][2]:.0f} 提到 {rows[-1][2]:.0f} token/s（{rows[-1][2] / rows[0][2]:.1f} 倍），"
          f"代价是单请求延迟从 {rows[0][1]:.2f} ms 涨到 {rows[-1][1]:.2f} ms")
    print("    ⇒ 注意：小规模下每次测量都可能抖动，所以这里取中位数——单次测量不足以下结论")


def test_memory_breakdown():
    print("\n[3] 显存分解与并发上限")
    n_params = 7_000_000_000
    print(f"    权重（7B, fp16）= {weights_gib(n_params):.1f} GiB")
    near("7B fp16 权重约为 13.0 GiB", weights_gib(n_params), 13.0, 0.1)

    heads, head_dim, layers = 32, 128, 32
    for seq in (4096, 32768):
        c = kv_cache_gib(1, heads, seq, head_dim, layers)
        print(f"    单请求 cache（T={seq}）= {c:.4f} GiB")
        ok(f"T={seq} 的 cache 大于 0", c > 0)

    near("T 从 4096 到 32768（8 倍）时 cache 也放大 8 倍",
         kv_cache_gib(1, heads, 32768, head_dim, layers) / kv_cache_gib(1, heads, 4096, head_dim, layers), 8.0)

    vram = 24.0
    for seq in (4096, 32768):
        m = max_concurrency(vram, n_params, heads, seq, head_dim, layers)
        print(f"    24 GiB 卡、T={seq}：最多并发 {m} 条")
    ok("长上下文的并发上限更低", max_concurrency(vram, n_params, heads, 32768, head_dim, layers)
       < max_concurrency(vram, n_params, heads, 4096, head_dim, layers))


def test_cost_formula():
    print("\n[4] 成本公式：三档计价与缓存收益")
    price_in, price_out, price_cached = 3.0, 15.0, 0.3  # 每百万 token 的相对单价
    n_in, n_out, n_cached = 1000, 500, 800

    full = request_cost(n_in, n_out, 0, price_in, price_out, price_cached)
    cached = request_cost(n_in - n_cached, n_out, n_cached, price_in, price_out, price_cached)
    print(f"    无缓存：{full:.4f}；命中 {n_cached} 个：{cached:.4f}（省 {(1 - cached / full):.1%}）")
    ok("缓存命中降低成本", cached < full)

    # 输出比输入贵 ⇒ 长回答的成本由输出主导
    long_out = request_cost(n_in, 5000, 0, price_in, price_out, price_cached)
    long_in = request_cost(6000, n_out, 0, price_in, price_out, price_cached)
    print(f"    长输出（5000）：{long_out:.4f}；长输入（6000）：{long_in:.4f}")
    ok("同等 token 量下长输出更贵", long_out > long_in)

    # 价差倍数
    ratio = price_out / price_in
    near("输出是输入的 5 倍价", ratio, 5.0)
    print(f"    ⇒ 输出单价是输入的 {ratio:.0f} 倍，所以「少说话」往往比「少读」更省钱")
    ok("缓存单价低于输入单价", price_cached < price_in)


def test_cache_hit_value():
    print("\n[5] 前缀复用的收益：命中率决定节省")
    price_in, price_out, price_cached = 3.0, 15.0, 0.3
    n_in, n_out = 4096, 200
    for hit in (0.0, 0.5, 0.9, 1.0):
        cached = int(n_in * hit)
        cost = request_cost(n_in - cached, n_out, cached, price_in, price_out, price_cached)
        base = request_cost(n_in, n_out, 0, price_in, price_out, price_cached)
        print(f"    命中率 {hit:>4.0%}：成本 {cost:>8.3f}（占无缓存的 {cost / base:.1%}）")

    full_hit = request_cost(0, n_out, n_in, price_in, price_out, price_cached)
    ok("全命中时只剩输出成本与缓存成本", full_hit == n_out * price_out + n_in * price_cached)
    print(f"    ⇒ 全命中从 {request_cost(n_in, n_out, 0, price_in, price_out, price_cached):.3f} "
          f"降到 {full_hit:.3f}")


def main():
    print("=" * 68)
    print("推理的成本结构")
    print("=" * 68)
    test_latency_breakdown()
    test_batching()
    test_memory_breakdown()
    test_cost_formula()
    test_cache_hit_value()
    print("\n" + "=" * 68)
    print(f"结果：{pass_count} 通过，{fail_count} 不通过")
    print("=" * 68)
    if fail_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
