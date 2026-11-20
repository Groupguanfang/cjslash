---
description: Codes, levels, names, messages, and hint templates for 997 diagnostics extracted from a local Cangjie SDK 1.2.1.
---

# Diagnostic codes

This page records a **Cangjie SDK 1.2.1** snapshot containing **997 diagnostics**: 924 errors, 67 warnings, and 6 notes. Search by code, diagnostic name, or message, and filter by category or level.

## Applicable version

| Item | Value |
| --- | --- |
| Compiler version | `Cangjie Compiler: 1.2.1 (cjnative)` |
| SDK target | `aarch64-apple-darwin` |
| Data source | `tools/lib/libcangjie-lsp.dylib` in the SDK |
| Coverage | Every message entry in the original and refactored diagnostic tables |
| Excluded entries | 28 internal `*_diag_begin` / `*_diag_end` boundary markers |

The data was extracted directly from this SDK library, rather than inferred from definition order on the current development branch. Codes and messages belong to this particular SDK snapshot. For other versions or platforms, use the diagnostics returned by the actual language server.

## Usage

Use the numeric codes with [`@errors` or `@noErrors`](./notations#diagnostics). For example, `776` reports an assignment to an immutable value:

```cj cjslash
// @errors: 776
main() {
    let answer = 42
    answer = 43
    println(answer)
}
```

The table preserves the SDK's original English messages for comparison with compiler output. `%s`, `%d`, `%p`, and similar placeholders are replaced at runtime. Primary and additional hints are also templates; their actual content depends on the source. Some general-purpose entries contain only `%s`, with their complete message supplied by the caller.

Notes provide supplementary diagnostic information and may not appear as standalone LSP diagnostics. Built-in compiler driver, macro expansion, CHIR, and other entries may also be unavailable during documentation analysis through the LSP.

## Additional LSP diagnostics

The language server also produces diagnostics outside the compiler's fixed message tables. Observed examples from SDK 1.2.1 include:

| Code | Cjslash level | Observed message example |
| --- | --- | --- |
| `0` | `suggestion` | `Variable 'answer' is declared but never used` |
| `0` | `suggestion` | `Parameter '<invalid identifier>' is declared but never used` |

These diagnostics share code `0`, with messages generated from the symbol. They do not represent the compiler's `chir_diag_begin` marker and are excluded from the 997 fixed messages below. Allow or suppress these suggestions using `@errors: 0` or `@noErrors: 0`, and use their actual `text` to distinguish their meanings.

## Complete table

<CjslashDiagnostics />

## Sources and maintenance

Diagnostic names and templates are defined in the official compiler's [`include/cangjie/Basic/`](https://gitcode.com/Cangjie/cangjie_compiler/tree/main/include/cangjie/Basic) directory and its `DiagRefactor` subdirectory. The SDK retains two tables: original entries use their own indices; refactored entries add their indices to the original code of `sema_diag_end`. The offset in this snapshot is `287`. Excluding boundary markers leaves gaps between some codes. Diagnostics with the same name may also have different codes in the two tables.

Extraction preserves original names, levels, primary messages, primary hints, and every additional hint. The documentation repository stores the complete data and the source library's SHA-256 in `docs/data/diagnostics-1.2.1.json`. The script checks code uniqueness and verifies `731` and `776` against known results from real SDK tests.

To regenerate the snapshot, install the macOS ARM64 SDK 1.2.1 and `clang++`, then run:

```bash
CJSLASH_SDK_PATH=/path/to/cangjie pnpm exec vp run docs:diagnostics
```

Regular documentation builds use the committed snapshot and do not need to extract the tables again. This is a version reference provided by Cjslash, rather than an official guarantee that Cangjie codes remain stable across releases. Diagnostic templates come from the Cangjie SDK; see the upstream [Cangjie project license](https://cangjie-lang.cn/pages/LICENSE).
