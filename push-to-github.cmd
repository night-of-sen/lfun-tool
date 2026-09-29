@echo off
cd /d "%~dp0"
setlocal

echo ==================================================
echo   Commit + Push to GitHub
echo   (no global git config is modified)
echo ==================================================
echo.

set "SSL=-c http.sslBackend=openssl"
set "PROXY=http.proxy=http://127.0.0.1:7890"
set "TLS=-c http.sslBackend=openssl -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 -c http.version=HTTP/1.1"

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
echo [1/4] Syncing with remote (best effort) - direct ...
echo.
git %SSL% pull --rebase origin main
if %ERRORLEVEL%==0 goto push
echo.
echo   Direct sync failed, trying proxy ...
git %TLS% pull --rebase origin main
if %ERRORLEVEL%==0 goto push
echo.
echo   Sync unavailable (network). Aborting any half-done rebase.
git rebase --abort 2>nul
echo   Continuing to push anyway - a rejected push will tell us if
echo   the remote really has new commits.
echo.
goto push

:push
echo [2/4] Push - direct connection with openssl TLS backend ...
echo.
git %SSL% push -u origin main
if %ERRORLEVEL%==0 goto ok

echo.
echo [3/4] Retrying push through FlClash proxy 127.0.0.1:7890 ...
echo.
git %TLS% push -u origin main
if %ERRORLEVEL%==0 goto ok

echo.
echo [4/4] Retrying push with HTTP/1.1 only ...
echo.
git -c http.sslBackend=openssl -c http.version=HTTP/1.1 push -u origin main
if %ERRORLEVEL%==0 goto ok

echo.
echo ==================================================
echo   ALL PUSH ATTEMPTS FAILED
echo ==================================================
echo.
echo   --- git status ---
git status -sb
echo   --- ahead / behind vs origin ---
for /f %%i in ('git rev-list --count origin/main..main') do echo   local ahead: %%i
for /f %%i in ('git rev-list --count main..origin/main') do echo   local behind: %%i
echo.
echo   Send the text above back to DSH.
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
