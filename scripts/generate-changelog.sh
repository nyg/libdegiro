#!/usr/bin/env sh
set -eu

VERSION="${1:?usage: generate-changelog.sh <version>}"
echo "Generating changelog for version $VERSION"

git cliff --tag "v$VERSION" -o CHANGELOG.md
git add CHANGELOG.md
