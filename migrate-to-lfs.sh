#!/bin/bash
# Migrate existing PNG files to Git LFS

echo "Migrating PNG files to Git LFS..."
echo ""

# Make sure Git LFS is installed
if ! command -v git-lfs &> /dev/null; then
    echo "❌ Git LFS is not installed!"
    echo "Please run: ./install-git-lfs.sh"
    exit 1
fi

# Verify Git LFS is initialized
git lfs install

# Track PNG files (already done in .gitattributes, but ensure it's active)
echo "Tracking PNG files with Git LFS..."
git add .gitattributes

# Remove PNG files from Git cache and re-add them through LFS
echo "Migrating existing PNG files..."
git rm --cached public/*.png 2>/dev/null || true
git rm --cached *.png 2>/dev/null || true

# Re-add them (they'll be tracked by LFS now)
git add public/*.png 2>/dev/null || true
git add *.png 2>/dev/null || true

# Check what will be committed
echo ""
echo "Files to be migrated to LFS:"
git lfs ls-files

echo ""
echo "✅ Ready to commit! Run:"
echo "   git commit -m 'Migrate PNG files to Git LFS'"
echo "   git push origin main"
