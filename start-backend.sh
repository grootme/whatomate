#!/bin/bash
export PATH="$HOME/go/go/bin:$PATH"
cd /home/z/my-project/backend
exec ./whatomate server -config config.toml -workers 0
