#!/usr/bin/env python3
"""Безопасное удаление ВРЕМЕННОГО блока `location = /api/lead { ... return 503 ... }` из конфигурации nginx FinikFix.

Работает построчно-лексически: учитывает вложенные фигурные скобки, строки в кавычках (в том числе JSON внутри `return 503 '{"ok":false}'`)
и комментарии `#`. Удаляет ТОЛЬКО блок, внутри которого есть `return 503` (иначе это не временная заглушка и блок не трогается),
плюс сразу над ним идущие строки-комментарии о заглушке. Соседние location/server не затрагиваются.

  nginx_lead_block.py FILE --check    # сколько заглушек найдено (0 или больше), файл не меняется
  nginx_lead_block.py FILE            # удалить, записать атомарно; код 0 — удалено, 3 — нечего удалять, 2 — ошибка разбора
"""
import os, re, sys, tempfile

HEAD = re.compile(r'location\s*=\s*/api/lead\s*\{')
COMMENT_KEYS = ('/api/lead', 'ВРЕМЕННО', 'заявок', 'location')


def scan_block(s, open_idx):
    """open_idx — позиция '{'. Возвращает позицию парной '}' или -1. Кавычки и комментарии пропускаются."""
    depth, i, n = 0, open_idx, len(s)
    while i < n:
        c = s[i]
        if c == '#':
            while i < n and s[i] != '\n':
                i += 1
            continue
        if c in ('"', "'"):
            q = c; i += 1
            while i < n and s[i] != q:
                if s[i] == '\\':
                    i += 1
                i += 1
            i += 1
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def find_blocks(s):
    out, pos = [], 0
    while True:
        m = HEAD.search(s, pos)
        if not m:
            break
        # строка с комментарием '#' перед location — не считаем
        ls = s.rfind('\n', 0, m.start()) + 1
        if s[ls:m.start()].strip().startswith('#'):
            pos = m.end(); continue
        end = scan_block(s, m.end() - 1)
        if end < 0:
            raise ValueError('не найдена закрывающая скобка блока /api/lead')
        body = s[m.end():end]
        if re.search(r'(?m)^\s*return\s+503\b', body):
            out.append((ls, end + 1))
        pos = end + 1
    return out


def strip_leading_comments(s, start):
    lines_start = start
    while lines_start > 0:
        prev_end = lines_start - 1
        prev_start = s.rfind('\n', 0, prev_end) + 1
        line = s[prev_start:prev_end]
        if line.strip().startswith('#') and any(k in line for k in COMMENT_KEYS):
            lines_start = prev_start
        else:
            break
    return lines_start


def remove(s):
    blocks = find_blocks(s)
    for start, end in reversed(blocks):
        start = strip_leading_comments(s, start)
        tail = end
        if s[tail:tail + 1] == '\n':
            tail += 1
        s = s[:start] + s[tail:]
    return s, len(blocks)


def main(argv):
    if len(argv) < 2:
        print(__doc__); return 2
    path, check = argv[1], '--check' in argv[2:]
    try:
        src = open(path, encoding='utf-8').read()
        new, n = remove(src)
    except Exception as e:  # noqa
        print('ОШИБКА:', e, file=sys.stderr); return 2
    if check:
        print(n); return 0
    if n == 0:
        print('временной заглушки нет'); return 3
    if new.count('{') != new.count('}') and src.count('{') == src.count('}'):
        print('ОШИБКА: после правки нарушен баланс скобок, файл не изменён', file=sys.stderr); return 2
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.ff-lead-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(new)
        st = os.stat(path)
        os.chmod(tmp, st.st_mode & 0o7777)
        try: os.chown(tmp, st.st_uid, st.st_gid)
        except PermissionError: pass
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
    print(f'удалено блоков: {n}'); return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
