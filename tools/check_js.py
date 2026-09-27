"""Crude JS sanity check: string/comment-aware bracket balance per file."""
import sys


def check(path):
    src = open(path, encoding="utf-8").read()
    i, n = 0, len(src)
    stack = []
    mode = "code"  # code | squote | dquote | line | block
    line = 1
    pairs = {")": "(", "]": "[", "}": "{"}
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
        if mode == "code":
            if c == "/" and i + 1 < n and src[i + 1] == "/":
                mode = "line"
                i += 2
                continue
            if c == "/" and i + 1 < n and src[i + 1] == "*":
                mode = "block"
                i += 2
                continue
            if c == "'":
                mode = "squote"
            elif c == '"':
                mode = "dquote"
            elif c in "([{":
                stack.append((c, line))
            elif c in ")]}":
                if not stack or stack[-1][0] != pairs[c]:
                    return "%s:%d unbalanced %s" % (path, line, c)
                stack.pop()
        elif mode == "line":
            if c == "\n":
                mode = "code"
        elif mode == "block":
            if c == "*" and i + 1 < n and src[i + 1] == "/":
                mode = "code"
                i += 2
                continue
        else:  # in string
            if c == "\\":
                i += 2
                continue
            if (mode == "squote" and c == "'") or (mode == "dquote" and c == '"'):
                mode = "code"
        i += 1
    if mode == "block":
        return "%s: unterminated block comment" % path
    if stack:
        return "%s: unclosed %s from line %d" % (path, stack[-1][0], stack[-1][1])
    return None


if __name__ == "__main__":
    bad = 0
    for p in sys.argv[1:]:
        err = check(p)
        if err:
            bad += 1
            print("FAIL", err)
        else:
            print("OK  ", p)
    sys.exit(1 if bad else 0)
