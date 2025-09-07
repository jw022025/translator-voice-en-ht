# Translator (EN→HT) — Lab 0
Minimal Node app to learn Docker fundamentals. Run with:

```bash
npm i
npm start
# or
docker build -t translator:lab0 .
docker run -p 8080:8080 translator:lab0

---

### 4. `package.json`  
(Node project manifest)  
```json
{
  "name": "translator-voice-en-ht",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  }
}
