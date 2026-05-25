#!/bin/bash
cd /home/z/my-project/telethon-service
exec python3 -c "
import uvicorn
uvicorn.run('server:app', host='0.0.0.0', port=8700, log_level='info')
"
