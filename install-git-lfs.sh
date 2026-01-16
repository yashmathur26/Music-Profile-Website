#!/bin/bash
# Install Git LFS on macOS (Apple Silicon)

echo "Installing Git LFS for macOS (Apple Silicon)..."
echo ""

# Download Git LFS
echo "Downloading Git LFS..."
curl -L -o /tmp/git-lfs.zip https://github.com/git-lfs/git-lfs/releases/download/v3.6.1/git-lfs-darwin-arm64-v3.6.1.zip

# Unzip
echo "Extracting..."
cd /tmp
unzip -q git-lfs.zip
cd git-lfs-*

# Install (requires sudo)
echo "Installing (requires sudo password)..."
sudo ./install.sh

# Initialize Git LFS
echo "Initializing Git LFS..."
git lfs install

echo ""
echo "✅ Git LFS installed successfully!"
echo "Run: git lfs version (to verify)"
