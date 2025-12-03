#!/usr/bin/env python3
"""Run bruno `.bru` HTTP request definitions against a server (default http://localhost:3000).

Usage:
  python bruno_runner.py path/to/file.bru
  python bruno_runner.py bruno/Player\ 2  # run all .bru files in folder in sequence

Features:
- Parse simple `.bru` files used in this workspace (meta, post/get, body:json, script:post-response)
- Replace variables like `{{BASE_URL}}` or `{{p2Secret}}` from environment or previous responses
- Execute `bru.setVar('name', res.body.someField)` patterns in `script:post-response` to capture variables

Note: requires `requests` (pip install requests).
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import requests
except Exception:
    print("Missing dependency 'requests'. Install with: pip install requests")
    raise


def read_file(path):
    return Path(path).read_text(encoding="utf-8")


def strip_backticks(text):
    # Remove surrounding ```bruno ... ``` if present
    m = re.search(r"```bruno\n([\s\S]*?)\n```", text)
    return m.group(1) if m else text


def parse_blocks(text):
    # Simple parser: find blocks like `header { ... }` including nested braces
    blocks = {}
    i = 0
    N = len(text)
    while i < N:
        # skip whitespace/newlines
        if text[i].isspace():
            i += 1
            continue
        # match header
        m = re.match(r"([a-zA-Z0-9_:\-]+)(?::([a-zA-Z0-9_\-]+))?\s*\{", text[i:])
        if not m:
            # nothing more parseable
            break
        header = m.group(1)
        sub = m.group(2)
        key = header + (":" + sub if sub else "")
        i += m.end()
        # now read until matching closing brace counting nested braces
        start = i
        depth = 1
        while i < N and depth > 0:
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
            i += 1
        # content is between start and i-1
        content = text[start:i-1].strip()
        blocks[key] = content
    return blocks


def parse_key_values(block):
    # parse simple lines like `url: {{BASE_URL}}/join` or `body: json`
    kv = {}
    for line in block.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if ':' in line:
            k, v = line.split(':', 1)
            kv[k.strip()] = v.strip()
    return kv


VAR_RE = re.compile(r"\{\{([^}]+)\}\}")


def substitute_vars(s, vars):
    def repl(m):
        name = m.group(1)
        return str(vars.get(name, os.environ.get(name, m.group(0))))
    return VAR_RE.sub(repl, s)


def extract_json_from_body_block(content):
    # content may contain JSON starting at first '{'
    idx = content.find('{')
    if idx == -1:
        return None
    # find matching brace
    i = idx
    depth = 0
    N = len(content)
    while i < N:
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                return content[idx:i+1]
        i += 1
    return None


def apply_post_response_scripts(script_text, resp_json, vars):
    # Find bru.setVar('name', res.body.some.path)
    pattern = re.compile(r"bru\.setVar\(\s*'([^']+)'\s*,\s*res\.body\.([A-Za-z0-9_\.]+)\s*\)")
    for m in pattern.finditer(script_text):
        varname = m.group(1)
        path = m.group(2)
        # resolve path in resp_json
        value = resp_json
        for part in path.split('.'):
            if isinstance(value, dict) and part in value:
                value = value[part]
            else:
                value = None
                break
        if value is not None:
            vars[varname] = value


def run_bru_file(path, vars, base_url, delay=0.0, dry_run=False):
    text = read_file(path)
    body = strip_backticks(text)
    blocks = parse_blocks(body)
    meta = {}
    if 'meta' in blocks:
        meta = parse_key_values(blocks['meta'])

    method = 'post'
    if 'post' in blocks:
        post_kv = parse_key_values(blocks['post'])
        method = 'post'
        url_templ = post_kv.get('url')
    elif 'get' in blocks:
        get_kv = parse_key_values(blocks['get'])
        method = 'get'
        url_templ = get_kv.get('url')
    else:
        print("No post/get block in {}".format(path))
        return

    url = substitute_vars(url_templ or '', vars)
    if url.startswith('{{BASE_URL}}'):
        url = url.replace('{{BASE_URL}}', base_url)

    body_data = None
    if 'body:json' in blocks:
        raw_json_text = extract_json_from_body_block(blocks['body:json'])
        if raw_json_text:
            raw_json_text = substitute_vars(raw_json_text, vars)
            try:
                body_data = json.loads(raw_json_text)
            except Exception as e:
                print("Failed to parse JSON body in {}: {}".format(path, e))
                print(raw_json_text)
                return

    try:
        fname = Path(path).name
    except Exception:
        fname = str(path)
    print("-> {} {} (file: {})".format(method.upper(), url, fname))
    if body_data is not None:
        print(json.dumps(body_data, indent=2))

    if dry_run:
        print("dry-run: not sending request")
        return

    try:
        if method == 'post':
            r = requests.post(url, json=body_data, timeout=10)
        else:
            r = requests.get(url, params=body_data, timeout=10)
    except Exception as e:
        print("Request failed: {}".format(e))
        return

    print("<- {} {}".format(r.status_code, r.reason))
    resp_json = None
    try:
        resp_json = r.json()
        print(json.dumps(resp_json, indent=2))
    except Exception:
        print(r.text)

    # run post-response script if present
    if 'script:post-response' in blocks and resp_json is not None:
        apply_post_response_scripts(blocks['script:post-response'], resp_json, vars)

    if delay:
        time.sleep(delay)


def collect_bru_files(path):
    if path.is_file():
        return [path]
    files = sorted([p for p in path.iterdir() if p.suffix == '.bru'])
    # read seq from meta to sort if present
    def seq_of(p):
        try:
            text = strip_backticks(read_file(p))
            blocks = parse_blocks(text)
            if 'meta' in blocks:
                kv = parse_key_values(blocks['meta'])
                return int(kv.get('seq', 9999))
        except Exception:
            pass
        return 9999
    return sorted(files, key=seq_of)


def run_sequence_file(seq_path, vars, base_url, delay=0.0, dry_run=False):
    """Read a plain-text sequence file listing .bru paths (one per line) and run them in order."""
    text = read_file(seq_path)
    text = strip_backticks(text)
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        # remove surrounding quotes
        if (line.startswith('"') and line.endswith('"')) or (line.startswith("'") and line.endswith("'")):
            line = line[1:-1]
        lines.append(line)

    for entry in lines:
        p = Path(entry)
        if not p.is_absolute():
            p = seq_path.parent / p
        if not p.exists():
            print("Sequence entry not found: {}".format(p))
            continue
        # if it's a folder, collect .bru files inside
        if p.is_dir():
            files = collect_bru_files(p)
            for f in files:
                run_bru_file(f, vars, base_url, delay=delay, dry_run=dry_run)
        else:
            run_bru_file(p, vars, base_url, delay=delay, dry_run=dry_run)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('path', help='Path to .bru file or folder')
    ap.add_argument('--base-url', default=os.environ.get('BASE_URL', 'http://localhost:3000'))
    ap.add_argument('--delay', type=float, default=0.0, help='Delay between requests (seconds)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--var', action='append', help='Set variable KEY=VALUE (can repeat)')
    args = ap.parse_args()

    p = Path(args.path)
    if not p.exists():
        print("Path not found: {}".format(p))
        sys.exit(2)

    vars = {}
    # seed with env
    vars['BASE_URL'] = args.base_url
    if args.var:
        for v in args.var:
            if '=' in v:
                k, val = v.split('=', 1)
                vars[k] = val

    # If the path is a sequence file (text file), run entries in order
    if p.is_file() and p.suffix in ('.txt', '.seq'):
        run_sequence_file(p, vars, args.base_url, delay=args.delay, dry_run=args.dry_run)
        return

    files = collect_bru_files(p)
    if not files:
        print("No .bru files found at path")
        sys.exit(1)

    for f in files:
        run_bru_file(f, vars, args.base_url, delay=args.delay, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
