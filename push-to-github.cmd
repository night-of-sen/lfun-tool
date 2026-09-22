@echo off
cd /d "%~dp0"
setlocal

echo ==================================================
echo   Commit + Push to GitHub
echo   (no global git config is modified)
echo ==================================================
echo.

git add -A
git diff --cached --quiet
if %ERRORLEVEL%==1 goto commit
echo Nothing to commit - working tree is clean.
goto push

:commit
echo Committing pending changes ...
git commit -m "update: rebuild pages and data"
echo.

:push
echo [1/2] Direct connection with openssl TLS backend ...
echo.
git -c http.sslBackend=openssl push -u origin main
if %ERRORLEVEL%==0 goto ok

echo.
echo [2/2] Retrying through FlClash proxy 127.0.0.1:7890 ...
echo.
git -c http.sslBackend=openssl ^
    -c http.proxy=http://127.0.0.1:7890 ^
    -c https.proxy=http://127.0.0.1:7890 ^
    -c http.version=HTTP/1.1 ^
    push -u origin main
if %ERRORLEVEL%==0 goto ok

echo.
echo ==================================================
echo   BOTH ATTEMPTS FAILED
echo ==================================================
echo   Send the error text above back to DSH.
goto end

:ok
echo.
echo ==================================================
echo   PUSHED SUCCESSFULLY
echo ==================================================
echo   Hostinger will pick it up on next Deploy.
echo.

:end
echo.
pause