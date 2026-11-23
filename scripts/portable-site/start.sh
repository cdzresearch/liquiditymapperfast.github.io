#!/bin/sh
cd "$(dirname "$0")"
PORT=5173
if [ ! -f index.html ]; then
  echo "No index.html here. Download liquiditymapperfast-tape-speed-site.zip, not the GitHub source repo."
  exit 1
fi
echo "Serving at http://127.0.0.1:$PORT/  Close this window to stop."
python3 -m http.server "$PORT" --bind 127.0.0.1 &
PID=$!
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if python3 -c "import socket;s=socket.create_connection(('127.0.0.1',$PORT),1)" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
(command -v open >/dev/null && open "http://127.0.0.1:$PORT/" || command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT/" || true)
wait $PID
