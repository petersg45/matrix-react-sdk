#!/usr/bin/env python3

"""
Tool to update translation files. Requires Python 3.5 or later.

Exit value 0 if no changes are needed, or if the file was automatically updated.
Exit value 1 if changes are needed but file was not updated.

Usage:
scripts/update_translation.py src/i18n/strings/en_EN.json src/**/*.js
scripts/update_translation.py --auto-add --auto-remove src/i18n/strings/en_EN.json src/**/*.js
"""

import sys
import re
import json
import argparse
import glob
import itertools

try:
    from typing import Sequence, Set
except ImportError:
    print('%s requires Python 3.5 or later!'%sys.argv[1])
    raise

def main() -> int:
    """Main entrypoint"""

    args = parse_args()

    plural_separator = '|' # The separator used to indicate where a string ends and the plural type begins

    # Open JSON file containing translated strings
    try:
        with open(args.strings_path, encoding='utf-8') as json_file:
            ref = json.load(json_file)

        # Remove information about plurals. In the source code the base form is used.
        existing = set(x.split(plural_separator, 1)[0] for x in ref.keys())
    except (AttributeError, json.JSONDecodeError, IOError):
        print('Error opening file %s'%args.string_path)
        return 1

    found = find_strings(args.src_paths)

    if found == existing:
        # Nothing to do, found strings match what is already in the translation file
        return 0

    added = found - existing
    if bool(added):
        print('Add:')
        print('----')
        print('\n'.join(added))

    if args.auto_add:
        for string in added:
            ref[string] = string # Add string with itself as translation

    print()

    removed = existing - found
    if bool(removed):
        print('Removed:')
        print('--------')
        print('\n'.join(removed))

    if args.auto_remove:
        for string in removed:
            # Loop over all translation keys and see if it matches what should be removed
            # Also take into account the plural options by checking if there is a match up to the separator
            for key in list(ref):
                if key == string or key.startswith(string + plural_separator):
                    del ref[key]

    if args.auto_remove or args.auto_add:
        # Update translation file
        with open(args.strings_path, 'w', encoding='utf-8') as json_file:
            json.dump(ref, json_file, indent=4, sort_keys=True)

        print()
        print('Updated %s'%args.strings_path)
        return 0

    return 1

def parse_args() -> argparse.Namespace:
    """Parse command line arguments"""

    parser = argparse.ArgumentParser(description='Update translation')
    parser.add_argument('strings_path', metavar='JSON_STRING_FILE', help='JSON file with strings')
    parser.add_argument('src_paths', metavar='JS_SRC_FILE', nargs='+', help='.js source file')
    parser.add_argument('--auto-add', dest='auto_add', action='store_true', help='Automatically add missing string')
    parser.add_argument('--auto-remove', dest='auto_remove', action='store_true', help='Automatically remove extra strings')
    args = parser.parse_args()

    # Expand globs in case the shell does not know how to do it
    try:
        globbed = (glob.glob(pattern, recursive=True) for pattern in args.src_paths)
    except TypeError:
        print('%s requires Python 3.5 or later!'%sys.argv[1])
        raise

    args.src_paths = list(itertools.chain.from_iterable(globbed))

    return args

def find_strings(src_paths: Sequence[str]) -> Set[str]:
    """Find translatable strings in source files"""

    # Regular expression to find translatable string
    # Basically look inside calls to _t(), _td() and _tJsx()
    # Account for different types of quotes
    texpr = re.compile(r'_t(?:d|Jsx)?\s*\(\s*(["\'`])(.*?)\1\s*[,)]')

    # Regular expression to find string concatenation (i.e. "a" + "b")
    concatexpr = re.compile(r'(["\'`])\s*[+]\s*\1', re.DOTALL|re.MULTILINE)

    # Loop over each source file and find strings
    found = set()
    for path in src_paths:
        with open(path, encoding='utf-8') as srcfile:
            # Do all string concatenations
            content = concatexpr.sub('', srcfile.read())

            # Find strings
            for match in texpr.findall(content):
                found.add(match[1].replace(r"\'", "'").replace(r'\"', '"')) # Unescape javascript quotes

    return found

if __name__ == '__main__':
    sys.exit(main())
