"""cs336/a0_bpe.py — 从零实现 BPE 分词器

对标 CS336 的第一部分（tokenization）。纯 Python，不依赖 PyTorch，运行极快。

覆盖：
  1. 字节级 BPE 训练：反复合并出现频率最高的相邻对
  2. 编码 / 解码往返一致性
  3. 不同内容类型的 token 密度（英文 / 中文 / 代码 / JSON / 数字串）
  4. 常见片段被合并成单个符号的证据
  5. 词表大小与序列长度的权衡

两条实验设计约束（否则测量结果不可信）：
  * 训练语料与测量样本必须**不重叠**——否则测到的是记忆而不是分词（见 7.6 的污染）。
  * 训练是确定性的（相同语料与合并次数 ⇒ 相同词表），因此可以精确断言。
"""

from collections import Counter

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


def to_symbols(text):
    """把文本转成初始符号序列：按 UTF-8 字节。"""
    return [bytes([b]) for b in text.encode("utf-8")]


def count_pairs(symbols):
    """统计相邻符号对的频次。"""
    return Counter(zip(symbols, symbols[1:]))


def merge_pair(symbols, pair):
    """把序列中所有出现的 pair 合并成一个符号。"""
    out = []
    i = 0
    while i < len(symbols):
        if i < len(symbols) - 1 and (symbols[i], symbols[i + 1]) == pair:
            out.append(symbols[i] + symbols[i + 1])
            i += 2
        else:
            out.append(symbols[i])
            i += 1
    return out


def train_bpe(text, num_merges):
    """训练 BPE：返回 (merges, 初始符号数, 合并后符号数, 词表大小)。

    merges 是有序的合并规则表——顺序很重要，编码时必须按同样顺序应用。
    """
    symbols = to_symbols(text)
    initial = len(symbols)
    merges = []
    for _ in range(num_merges):
        pairs = count_pairs(symbols)
        if not pairs:
            break
        # 频次相同时按符号本身排序，保证结果确定
        best = max(pairs.items(), key=lambda kv: (kv[1], kv[0]))[0]
        symbols = merge_pair(symbols, best)
        merges.append(best)
    vocab = set(symbols)
    for a, b in merges:
        vocab.add(a + b)
    return merges, initial, len(symbols), len(vocab)


def encode(text, merges):
    """按合并表顺序编码（贪心应用每一轮合并）。"""
    for pair in merges:
        text = merge_pair(text, pair)
    return text


# 训练语料：多样、不重复堆叠（避免"整段被合成一个符号"的假象）
TRAIN_CORPUS = (
    "Please change the log level to debug and redeploy the service. "
    "The user asked for a summary of the recent conversation. "
    "We store the tool output in a file and keep a pointer to it. "
    "Retries should be bounded and each attempt recorded. "
    "请把日志级别改成 debug，然后重新部署服务。 "
    "用户要求总结最近的对话内容，并保留关键约束。 "
    "压缩之后必须留下一条可查的记录，否则无法归因。 "
    '{"kind":"pointer","ref":"f42","tokens":20} '
    '{"role":"user","content":"summarize the turns"} '
    "def encode(text, merges):\n    return text\n "
    "for i in range(10):\n    total += i * 2\n "
) * 4

# 测量样本：与训练语料**不重叠**（同类内容、不同文本）
PROBES = {
    "英文": "Could you switch the logging verbosity to verbose before the rollout?",
    "中文": "请把日志详细程度调高，然后重新发布这个服务。",
    "JSON": '{"task":"increase_verbosity","mode":"verbose"}',
    "代码": "def decode(symbols):\n    return b''.join(symbols)",
    "UUID": "7f3a9c21-48b2-4e5d-9c17-2b6d8e0a1234",
}


def test_training_determinism():
    print("\n[1] 训练是确定性的")
    corpus = "the quick brown fox jumps over the lazy dog. the fox runs fast. " * 5
    m1, before1, after1, v1 = train_bpe(corpus, 60)
    m2, before2, after2, v2 = train_bpe(corpus, 60)
    ok("同样语料与合并次数得到同样的合并表", m1 == m2)
    ok("初始符号数 = UTF-8 字节数", before1 == len(corpus.encode("utf-8")))
    print(f"    语料 {len(corpus)} 字符 → {before1} 个初始符号 → 合并 60 次后 {after1} 个符号")
    ok("合并显著缩短序列", after1 < before1 * 0.7)
    ok("词表大小一致", v1 == v2)


def test_roundtrip():
    print("\n[2] 编码 / 解码往返一致")
    merges, before, after, _ = train_bpe(TRAIN_CORPUS, 200)
    probes = [
        "agent harness",
        "上下文压缩",
        "context compression",
        "工程 context 压缩",
        "请把日志详细程度调高",
        "def decode(symbols)",
    ]
    for probe in probes:
        symbols = encode(to_symbols(probe), merges)
        decoded = b"".join(symbols).decode("utf-8")
        ok(f"往返一致：{probe[:14]}", decoded == probe)
    print(f"    训练语料：{before} 初始符号 → 合并 200 次后 {after} 个符号（{before / after:.2f}x）")


def test_density():
    print("\n[3] 不同内容类型的 token 密度（测量样本与训练语料不重叠）")
    merges, _, _, _ = train_bpe(TRAIN_CORPUS, 200)
    print(f"    {'内容类型':>8} {'字符':>6} {'符号':>6} {'每字符':>8}")
    rows = {}
    for name, text in PROBES.items():
        symbols = encode(to_symbols(text), merges)
        rows[name] = len(symbols) / len(text)
        print(f"    {name:>8} {len(text):>6} {len(symbols):>6} {rows[name]:>8.3f}")

    ok("中文的每字符符号数高于英文", rows["中文"] > rows["英文"])
    ok("UUID 几乎无法压缩（每字符接近 1）", rows["UUID"] > 0.9)
    ok("代码的每字符符号数高于英文", rows["代码"] > rows["英文"])
    print("    ⇒ 同样字符数下，中文的符号数可达英文的数倍：按字符估成本会严重失准")


def test_frequent_merges():
    print("\n[4] 常见片段会被合并成单个符号")
    merges, _, _, _ = train_bpe(TRAIN_CORPUS, 200)
    symbols = encode(to_symbols("summarize"), merges)
    pieces = [s.decode("utf-8", "replace") for s in symbols]
    print(f"    'summarize' → {len(symbols)} 个符号：{pieces}")
    ok("往返正确", b"".join(symbols).decode("utf-8") == "summarize")
    ok("高频词被切成远少于字符数的符号", len(symbols) < len("summarize") * 0.6)

    rare = encode(to_symbols("qxzvwkj"), merges)
    print(f"    罕见串 'qxzvwkj' → {len(rare)} 个符号（几乎不压缩）")
    ok("罕见串几乎不被压缩", len(rare) >= len("qxzvwkj") - 1)


def test_vocab_tradeoff():
    print("\n[5] 词表大小与序列长度的权衡")
    print(f"    {'合并次数':>8} {'词表':>8} {'符号数':>10} {'相对初始':>10}")
    prev_symbols = None
    for n in (0, 20, 60, 120, 240):
        _, before, after, vocab = train_bpe(TRAIN_CORPUS, n)
        print(f"    {n:>8} {vocab:>8} {after:>10} {after / before:>10.3f}")
        if prev_symbols is not None:
            ok(f"合并次数 {n} 后符号数继续下降", after < prev_symbols)
        prev_symbols = after
    print("    ⇒ 词表越大序列越短，但词表本身也占模型参数——这是分词器的核心权衡")


def main():
    print("=" * 68)
    print("BPE 分词器：从零实现")
    print("=" * 68)
    test_training_determinism()
    test_roundtrip()
    test_density()
    test_frequent_merges()
    test_vocab_tradeoff()
    print("\n" + "=" * 68)
    print(f"结果：{pass_count} 通过，{fail_count} 不通过")
    print("=" * 68)
    if fail_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
