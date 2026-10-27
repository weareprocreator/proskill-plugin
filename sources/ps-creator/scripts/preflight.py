#!/usr/bin/env python3
"""ProSkill pre-flight: run the platform's security scan locally, before upload.

Mirrors the built-in rules of the ProSkill server scan
(src/lib/skills/guardrail-scan.ts and src/lib/skills/review-checks.ts in the
pro-skill repo), so an author hears about a blocker before anything is
created or versioned on ProSkill. The server stays the authority: an
organization admin can add rules or raise a warning to critical, and only the
server knows about those, so always read the server's verdict after upload too.

Standard library only. Usage:

    python3 preflight.py <skill_folder> [meta.json] [create|update]

meta.json holds the listing fields you are about to send to upload_skill or
update_skill (title, shortDescription, problemSolved, instructions, useCases,
nonUseCases, requiredInputs, expectedOutputs, exampleInput, exampleOutput).
The server scans those too, so pass them. In update mode only the fields you
send are checked, and missing required fields are not reported (the server
keeps the stored values).

Prints one JSON object: {"ok", "blockers": [...], "warnings": [...]}.
Exit code 0 when there are no blockers, 2 when there are, 1 on a usage error.
"""

import json
import os
import re
import sys

# The server's built-in rules, ported verbatim (same patterns, same flags).

CRITICAL_RULES = [
    ("aws-key", "AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("bearer-token", "Bearer token", re.compile(r"bearer\s+[a-zA-Z0-9\-._~+/]{32,}", re.I)),
    ("pem-private-key", "Private key", re.compile(r"-{5}BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-{5}")),
    ("api-key-assignment", "API key assignment", re.compile(r"api[_-]?keys?\s*[:=]\s*['\"][^'\"]{10,}", re.I)),
    ("secret-assignment", "Secret assignment", re.compile(r"(?:secret|password|token)\s*[:=]\s*['\"][^'\"]{8,}", re.I)),
]

WARNING_RULES = [
    ("prompt-injection-ignore", "Prompt injection (ignore instructions)",
     re.compile(r"ignore\s+(?:previous|prior|above)\s+instructions", re.I)),
    ("prompt-injection-disregard", "Prompt injection (disregard)",
     re.compile(r"disregard\s+(?:the\s+)?(?:previous|above|prior)", re.I)),
    ("prompt-injection-new", "Prompt injection (new instruction)",
     re.compile(r"new\s+instruction:", re.I)),
    ("shell-pipe", "Pipe to shell", re.compile(r"(?:curl|wget)\s+[^\n|]+\|\s*(?:ba)?sh", re.I)),
    ("safety-bypass", "Safety bypass", re.compile(r"(?:without|bypass|ignore|disable)\s+safety", re.I)),
    ("jailbreak", "Jailbreak", re.compile(r"jailbreak", re.I)),
    ("contains-script", "Contains a shell script",
     re.compile(r"```\s*(?:ba|z)?sh\b|```\s*shell\b|```\s*powershell\b|"
                r"#!\s*/(?:usr/)?bin/(?:env\s+)?(?:ba|z)?sh", re.I)),
]

TRIGGER_PHRASE = re.compile(
    r"\buse (?:this |it |the skill )?(?:when|whenever|if|for|to)\b|"
    r"\b(?:when|whenever|if) (?:the user|a user|you|someone|they|asked|asking)\b|"
    r"\btrigger(?:s|ed)? (?:when|on|if|whenever)\b|"
    r"\binvoke (?:when|if|whenever)\b",
    re.I,
)
MIN_DESCRIPTION_LENGTH = 50

# One curl/wget invocation, from the command name to the end of its line.
NETWORK_COMMAND = re.compile(r"(?:curl|wget)\s+\S[^\n]*", re.I)
# Flags that make it SEND a file (long options written -{2}name): -T or upload-file, a form
# field whose value is a file, request data read from a file (not data-raw), wget's post-file.
UPLOAD_FLAGS = re.compile(
    r"\s(?:-T|-{2}upload-file)[\s=]|\s(?:-F|-{2}form)[\s=]*[\"']?[^\s\"']*=[@<]|"
    r"\s(?:-d|-{2}data(?:-binary|-urlencode)?)[\s=]*[\"']?@|\s-{2}(?:post|body)-file[\s=]",
    re.I,
)


def network_commands(text):
    return NETWORK_COMMAND.findall(text)


SCRIPT_EXPLANATIONS = [
    (re.compile(r"(?:curl|wget)\s+[^\n|]+\|\s*(?:sudo\s+)?(?:ba|z)?sh", re.I),
     "downloads a remote script and pipes it straight into a shell to run immediately"),
    (re.compile(r"\brm\s+(?:-\w*r\w*f\w*|-\w*f\w*r\w*)\b", re.I), "force-deletes files or directories recursively"),
    (re.compile(r"\bchmod\s+(?:-\S+\s+)?(?:[0-7]{3,4}|\+?[rwxugoa]+)\b", re.I), "changes file permissions"),
    (re.compile(r"\bchown\b", re.I), "changes file ownership"),
    (re.compile(r"\bsudo\b", re.I), "runs a command with elevated (root) privileges"),
    (re.compile(r"\b(?:apt-get|apt|yum|dnf|brew|npm|pnpm|yarn|pip3?)\s+install\b", re.I),
     "installs one or more software packages"),
    (re.compile(r"\bgit\s+clone\b", re.I), "clones a git repository"),
    (re.compile(r"\bexport\s+\w*(?:key|token|secret|password)\w*\s*=", re.I),
     "sets an environment variable that looks like a credential"),
    (re.compile(r"(?:^|[\s;&|(])zip\s+(?:-\S+\s+)+\S|(?:^|[\s;&|(])zip\s+\S+\.(?:zip|skill)\b|"
                r"\bpython3?\s+-m\s+zipfile\b", re.I), "creates a zip archive"),
    (re.compile(r"\b(?:shasum|sha(?:1|224|256|384|512)sum|md5sum)\b", re.I), "computes a checksum of a file"),
    (re.compile(r"\bpython3?\s+(?:-\S+\s+)*(?:\"[^\"\n]*\.py\"|'[^'\n]*\.py'|[^\s\"']+\.py\b)", re.I),
     "runs a Python script"),
    (lambda text: any(UPLOAD_FLAGS.search(c) for c in network_commands(text)),
     "uploads a file to a network address"),
    (lambda text: any(not UPLOAD_FLAGS.search(c) for c in network_commands(text)),
     "downloads content from a network address"),
]

# Listing fields the server scans, with the names an author sees.
META_FIELDS = {
    "instructions": "instructions",
    "useCases": "use cases",
    "nonUseCases": "when not to use",
    "requiredInputs": "required inputs",
    "expectedOutputs": "expected outputs",
    "exampleInput": "example input",
    "exampleOutput": "example output",
    "shortDescription": "short description",
}
REQUIRED_FIELDS = {
    "title": "Skill name",
    "shortDescription": "Short description",
    "problemSolved": "Problem solved",
    "instructions": "Instructions",
    "useCases": "Use cases",
    "requiredInputs": "Required inputs",
    "expectedOutputs": "Expected outputs",
}
PLACEHOLDER = "TBD by author"

# Files that are credentials by their nature, whatever they contain.
SENSITIVE_NAMES = re.compile(
    r"(^\.env(\..*)?$|\.pem$|\.key$|\.p12$|\.pfx$|^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$|"
    r"^credentials(\.json)?$|service[-_]?account.*\.json$|\.npmrc$|\.netrc$)",
    re.I,
)
SKIP_DIRS = {".git", "__MACOSX", "node_modules", "__pycache__"}
MAX_SKILL_MD_BYTES = 1024 * 1024
MAX_BUNDLE_BYTES = 10 * 1024 * 1024
MAX_INSTRUCTIONS_CHARS = 1024


def line_of(text, index):
    return text.count("\n", 0, index) + 1


def snippet(text):
    return re.sub(r"\s+", " ", text)[:60]


def explain_script(text):
    phrases = []
    for test, phrase in SCRIPT_EXPLANATIONS:
        hit = test(text) if callable(test) else test.search(text)
        if hit and phrase not in phrases:
            phrases.append(phrase)
    if not phrases:
        return ("Contains a shell script; its exact behavior could not be determined automatically, "
                "so review the commands manually.")
    if len(phrases) == 1:
        return "This script " + phrases[0] + "."
    return "This script " + ", ".join(phrases[:-1]) + " and " + phrases[-1] + "."


def script_text(text, index):
    rest = text[index:]
    if rest.startswith("```"):
        close = rest.find("```", 3)
        if close != -1:
            return rest[:close]
    return rest[:500]


def description_of(skill_md):
    text = skill_md.lstrip("﻿")
    fm = re.match(r"^-{3}\r?\n([\s\S]*?)\r?\n-{3}(?:\r?\n|$)", text)
    if not fm:
        return None
    lines = re.split(r"\r?\n", fm.group(1))
    at = next((i for i, l in enumerate(lines) if re.match(r"^description\s*:", l)), -1)
    if at == -1:
        return None
    first = re.sub(r"^description\s*:\s*", "", lines[at])
    rest = []
    for l in lines[at + 1:]:
        if re.match(r"^\s+\S", l):
            rest.append(l.strip())
        elif l.strip() == "" and rest:
            rest.append("")
        else:
            break
    block = re.match(r"^[>|][+-]?\s*$", first.strip())
    joined = re.sub(r"\s+", " ", " ".join(rest if block else [first.strip()] + rest)).strip()
    quoted = re.match(r"^([\"'])([\s\S]*)\1$", joined)
    return (quoted.group(2) if quoted else joined).strip()


def scan_text(text, where, blockers, warnings, criticals_block=True):
    """Every occurrence of every rule, with line numbers, so a fix catches all of them."""
    for key, label, pattern in CRITICAL_RULES:
        for m in pattern.finditer(text):
            entry = {"rule": key, "label": label, "where": where, "line": line_of(text, m.start()),
                     "snippet": snippet(m.group(0))}
            (blockers if criticals_block else warnings).append(entry)
    for key, label, pattern in WARNING_RULES:
        for m in pattern.finditer(text):
            entry = {"rule": key, "label": label, "where": where, "line": line_of(text, m.start()),
                     "snippet": snippet(m.group(0))}
            if key in ("contains-script", "shell-pipe"):
                entry["explanation"] = explain_script(script_text(text, m.start()))
            warnings.append(entry)


def is_text(path):
    try:
        with open(path, "rb") as f:
            return b"\0" not in f.read(8192)
    except OSError:
        return False


def main(argv):
    args = argv[1:]
    if not args or args[0].startswith("-"):
        print(__doc__, file=sys.stderr)
        return 1
    folder = os.path.abspath(args[0])
    meta, mode = {}, "create"
    for arg in args[1:]:
        if arg in ("create", "update"):
            mode = arg
        else:
            with open(arg, encoding="utf-8") as f:
                meta = json.load(f)

    blockers, warnings = [], []
    skill_md_path = os.path.join(folder, "SKILL.md")
    if not os.path.isfile(skill_md_path):
        blockers.append({"rule": "bundle:no-skill-md", "label": "Skill file", "where": folder,
                         "detail": "No SKILL.md at the top of the folder; the server refuses the bundle."})
        print(json.dumps({"ok": False, "blockers": blockers, "warnings": warnings}, indent=2))
        return 2

    with open(skill_md_path, encoding="utf-8", errors="replace") as f:
        skill_md = f.read()

    # 1. The SKILL.md, exactly as the server scans it.
    scan_text(skill_md, "SKILL.md", blockers, warnings)

    if len(skill_md.encode("utf-8")) > MAX_SKILL_MD_BYTES:
        blockers.append({"rule": "bundle:skill-md-too-large", "label": "Skill file", "where": "SKILL.md",
                         "detail": "SKILL.md is over 1 MB; the server refuses it."})

    trimmed = skill_md.strip()
    structured = re.search(r"(^|\n)\s*#{1,6}\s|(^|\n)\s*[-*]\s|(^|\n)\s*\d+\.\s", trimmed)
    if not (structured and len(trimmed) >= 80):
        blockers.append({"rule": "check:instructions-structure", "label": "SKILL.md uses structured formatting",
                         "where": "SKILL.md",
                         "detail": "Add headings, bullets or numbered steps and at least 80 characters of body."})

    description = description_of(skill_md)
    if description is None:
        warnings.append({"rule": "frontmatter", "label": "No description in frontmatter", "where": "SKILL.md",
                         "line": 1, "snippet": "",
                         "explanation": "Claude decides when to use a skill from its description; without one it rarely triggers."})
    else:
        problems = []
        if len(description) < MIN_DESCRIPTION_LENGTH:
            problems.append("The description is %d characters; aim for at least %d."
                            % (len(description), MIN_DESCRIPTION_LENGTH))
        if not TRIGGER_PHRASE.search(description):
            problems.append('It never says when to use the skill; add a trigger such as "Use when the user asks to ...".')
        if problems:
            warnings.append({"rule": "weak-description", "label": "Weak skill description", "where": "SKILL.md",
                             "line": 1, "snippet": snippet(description), "explanation": " ".join(problems)})

    # 2. The listing fields (the server scans these with the same rules).
    for field, name in META_FIELDS.items():
        value = meta.get(field)
        if isinstance(value, str) and value:
            scan_text(value, "listing field: " + name, blockers, warnings)
    if mode == "create":
        missing = [label for key, label in REQUIRED_FIELDS.items()
                   if not str(meta.get(key) or "").strip() or str(meta.get(key)).strip() == PLACEHOLDER]
        if missing:
            blockers.append({"rule": "check:required-fields", "label": "All required fields completed",
                             "where": "listing", "detail": "Missing or placeholder: " + ", ".join(missing) + "."})
    instructions = meta.get("instructions")
    if isinstance(instructions, str) and len(instructions) > MAX_INSTRUCTIONS_CHARS:
        blockers.append({"rule": "field:instructions-too-long", "label": "Instructions", "where": "listing",
                         "detail": "instructions is %d characters; the server takes at most %d. It is a short "
                                   "description, not the SKILL.md body." % (len(instructions), MAX_INSTRUCTIONS_CHARS)})

    # 3. Every other file that would ship in the bundle. The server scan reads
    # only SKILL.md, but these files go to every installer, so a credential here
    # is a leak all the same: ps-creator blocks it.
    total = 0
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            path = os.path.join(root, name)
            rel = os.path.relpath(path, folder)
            if name == ".DS_Store":
                continue
            try:
                total += os.path.getsize(path)
            except OSError:
                continue
            if SENSITIVE_NAMES.search(name):
                blockers.append({"rule": "file:credential-file", "label": "Credential file in the folder",
                                 "where": rel, "detail": "This file holds credentials by its nature. Delete it or "
                                                         "move it out of the skill folder."})
                continue
            if rel == "SKILL.md" or not is_text(path):
                continue
            with open(path, encoding="utf-8", errors="replace") as f:
                content = f.read()
            for key, label, pattern in CRITICAL_RULES:
                for m in pattern.finditer(content):
                    blockers.append({"rule": key, "label": label, "where": rel, "line": line_of(content, m.start()),
                                     "snippet": snippet(m.group(0)),
                                     "detail": "Not read by the server scan, but it ships to everyone who installs."})
    if total > MAX_BUNDLE_BYTES:
        blockers.append({"rule": "bundle:too-large", "label": "Skill file", "where": folder,
                         "detail": "The folder holds %d bytes; the bundle must stay under 10 MB." % total})

    print(json.dumps({"ok": not blockers, "blockers": blockers, "warnings": warnings}, indent=2))
    return 0 if not blockers else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
