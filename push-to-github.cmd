@echo off
cd /d "%~dp0"
setlocal

echo ==================================================
echo   Commit + Push to GitHub
echo   (no global git config is modified)
echo ==================================================
echo.

set "SSL=-c http.sslBackend=openssl"
set "PROXY=-c http.sslBackend=openssl -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 -c http.version=HTTP/1.1"

git add -A
git diff --cached --quiet
if %ERRORLEVEL%==1 goto commit
echo Nothing to commit - working tree is clean.
goto sync

:commit
echo Committing pending changes ...
git commit -m "update: rebuild pages and data"
echo.

:sync
echo [1/3] Sync with remote first (rebase) - direct ...
echo.
git %SSL% pull --rebase origin main
if %ERRORLEVEL%==0 goto push
echo.
echo [1/3] Retrying sync through FlClash proxy 127.0.0.1:7890 ...
echo.
git %PROXY% pull --rebase origin main
if %ERRORLEVEL%==0 goto push

echo.
echo   Sync FAILED. Aborting rebase so the tree stays clean.
git rebase --abort 2>nul
echo   Send the error text above back to DSH.
goto end

:push
echo [2/3] Push - direct connection with openssl TLS backend ...
echo.
git %SSL% push -u origin main
if %ERRORLEVEL%==0 goto ok

echo.
echo [3/3] Retrying push through FlClash proxy 127.0.0.1:7890 ...
echo.
git %PROXY% push -u origin main
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
