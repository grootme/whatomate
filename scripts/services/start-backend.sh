#!/bin/bash
export PATH="$HOME/go/go/bin:$PATH"
cd /home/z/my-project
exec ./whatomate server -config config.example.toml -workers 0
