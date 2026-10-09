#!/usr/bin/env bash
# Exercises deploy.sh in a sandbox (fake $HOME, stub git/npm/pm2/psql/pg_dump/curl). Nothing real is touched.
#   bash scripts/deploy-smoke.sh
set -uo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "${SANDBOX}"' EXIT
FAILURES=0

pass() { printf '  ok   %s\n' "$*"; }
fail() { printf '  FAIL %s\n' "$*"; FAILURES=$((FAILURES + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

make_stubs() {
  local bin="$1"
  mkdir -p "${bin}"
  cat > "${bin}/git" <<'STUB'
#!/usr/bin/env bash
args=("$@")
[[ "${args[0]}" == "-C" ]] && { dir="${args[1]}"; args=("${args[@]:2}"); }
case "${args[0]}" in
  rev-parse) echo abc1234 ;;
  remote) echo "https://github.com/arkonki/Draconi-dev.git" ;;
  status|restore|fetch|checkout) ;;
  merge)
    # A real pull can rewrite deploy.sh while it is running. Simulate the worst case.
    if [[ -n "${SIMULATE_SELF_UPDATE:-}" ]]; then printf '\necho SELF-UPDATE-EXECUTED >&2; exit 99\n' >> "${dir}/deploy.sh"; fi ;;
  clone) mkdir -p "${args[-1]}/.git" "${args[-1]}/server" "${args[-1]}/hosting"
         touch "${args[-1]}/server/index.js"; cp "${FIXTURE_TEMPLATE}" "${args[-1]}/hosting/apache.htaccess.template"
         cp "${FIXTURE_DEPLOY}" "${args[-1]}/deploy.sh" ;;
esac
STUB
  cat > "${bin}/npm" <<'STUB'
#!/usr/bin/env bash
if [[ "$1 $2" == "run build" ]]; then
  mkdir -p dist/assets dist/icons
  echo '<html></html>' > dist/index.html; echo sw > dist/sw.js; echo '{}' > dist/manifest.webmanifest
  echo png > dist/dragonbane-icon.png; echo png > dist/icons/icon-192x192.png; echo js > dist/assets/app.js
fi
exit 0
STUB
  cat > "${bin}/pm2" <<'STUB'
#!/usr/bin/env bash
echo "pm2 $*" >> "${SANDBOX_LOG}"
exit 0
STUB
  cat > "${bin}/psql" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
  cat > "${bin}/pg_dump" <<'STUB'
#!/usr/bin/env bash
for arg in "$@"; do [[ "${arg}" == --file=* ]] && echo dump > "${arg#--file=}"; done
exit 0
STUB
  cat > "${bin}/curl" <<'STUB'
#!/usr/bin/env bash
[[ " $* " == *" --write-out "* ]] && { printf 401; exit 0; }
exit 0
STUB
  chmod +x "${bin}"/*
}

new_home() {
  HOME_DIR="${SANDBOX}/home-$1"
  mkdir -p "${HOME_DIR}/.config/draconi" "${HOME_DIR}/tmp"
  cat > "${HOME_DIR}/.config/draconi/production.env" <<EOF
DATABASE_URL=postgresql://u:p@localhost/db
ADMIN_EMAIL=admin@example.org
ADMIN_USERNAME=admin
ADMIN_PASSWORD=a-long-unique-test-password
ELKDATA_APP_IP=127.0.0.1
PORT=3999
EOF
  export SANDBOX_LOG="${HOME_DIR}/calls.log"; : > "${SANDBOX_LOG}"
}

make_checkout() {
  mkdir -p "$1/.git" "$1/server" "$1/hosting" "$1/src"
  touch "$1/server/index.js" "$1/src/keep-me.ts"
  cp "${FIXTURE_TEMPLATE}" "$1/hosting/apache.htaccess.template"
  cp "${REPO_ROOT}/deploy.sh" "$1/deploy.sh"
}

run_deploy() { # <script path> [env assignments...]
  local script="$1"; shift
  ( cd "$(dirname "${script}")" && env -i HOME="${HOME_DIR}" TMPDIR="${HOME_DIR}/tmp" USER=tester \
      PATH="${SANDBOX}/bin:/usr/bin:/bin:/usr/local/bin" SANDBOX_LOG="${SANDBOX_LOG}" \
      FIXTURE_TEMPLATE="${FIXTURE_TEMPLATE}" FIXTURE_DEPLOY="${REPO_ROOT}/deploy.sh" "$@" \
      bash "${script}" ) > "${HOME_DIR}/out.log" 2>&1
}

FIXTURE_TEMPLATE="${SANDBOX}/apache.template"
printf 'ProxyPass http://__DRACONI_API_HOST__:__DRACONI_API_PORT__/api\n' > "${FIXTURE_TEMPLATE}"
make_stubs "${SANDBOX}/bin"

echo "1) Run from inside the checkout (the way it is normally started), htdocs/draconi exists"
new_home one; APP="${HOME_DIR}/apps/draconi"; make_checkout "${APP}"; mkdir -p "${HOME_DIR}/htdocs/draconi/.well-known"
run_deploy "${APP}/deploy.sh"; status=$?
check "deploy succeeds" "[[ ${status} -eq 0 ]] || { cat ${HOME_DIR}/out.log; false; }"
check "checkout is NOT wiped (.git, server/, src/)" "[[ -d ${APP}/.git && -f ${APP}/server/index.js && -f ${APP}/src/keep-me.ts && -f ${APP}/deploy.sh ]]"
check "build exists in the checkout (dist/index.html)" "[[ -f ${APP}/dist/index.html ]]"
check "frontend published to htdocs/draconi" "[[ -f ${HOME_DIR}/htdocs/draconi/index.html && -f ${HOME_DIR}/htdocs/draconi/.htaccess ]]"
check "htaccess has host and port filled in" "grep -q 'http://127.0.0.1:3999/api' ${HOME_DIR}/htdocs/draconi/.htaccess"
check "API restarted exactly once" "[[ \$(grep -c 'pm2 restart' ${SANDBOX_LOG}) -eq 1 ]]"
check "no temporary script copies left behind" "[[ -z \"\$(ls ${HOME_DIR}/tmp | grep draconi-deploy)\" ]]"

echo "2) Run from inside the checkout, no htdocs/draconi"
new_home two; APP="${HOME_DIR}/apps/draconi"; make_checkout "${APP}"
run_deploy "${APP}/deploy.sh"; status=$?
check "deploy succeeds without a publish directory" "[[ ${status} -eq 0 ]] || { cat ${HOME_DIR}/out.log; false; }"
check "says nothing is published" "grep -q 'No publish directory configured' ${HOME_DIR}/out.log"
check "checkout intact and built" "[[ -d ${APP}/.git && -f ${APP}/src/keep-me.ts && -f ${APP}/dist/index.html ]]"

echo "3) Run from a web root (legacy layout), checkout in ~/apps/draconi"
new_home three; APP="${HOME_DIR}/apps/draconi"; make_checkout "${APP}"
WEBROOT="${HOME_DIR}/htdocs/site"; mkdir -p "${WEBROOT}"; cp "${REPO_ROOT}/deploy.sh" "${WEBROOT}/deploy.sh"
run_deploy "${WEBROOT}/deploy.sh"; status=$?
check "deploy succeeds" "[[ ${status} -eq 0 ]] || { cat ${HOME_DIR}/out.log; false; }"
check "published next to the script, deploy.sh kept" "[[ -f ${WEBROOT}/index.html && -f ${WEBROOT}/deploy.sh ]]"
check "checkout intact" "[[ -d ${APP}/.git && -f ${APP}/src/keep-me.ts ]]"

echo "4) Explicit DRACONI_PUBLIC_DIR pointing at the checkout is refused"
new_home four; APP="${HOME_DIR}/apps/draconi"; make_checkout "${APP}"
run_deploy "${APP}/deploy.sh" DRACONI_PUBLIC_DIR="${APP}"; status=$?
check "fails" "[[ ${status} -ne 0 ]]"
check "explains why" "grep -q 'Refusing to publish' ${HOME_DIR}/out.log"
check "checkout untouched, nothing restarted" "[[ -f ${APP}/src/keep-me.ts && ! -s ${SANDBOX_LOG} ]]"
run_deploy "${APP}/deploy.sh" DRACONI_PUBLIC_DIR="${HOME_DIR}"; status=$?
check "a parent of the checkout is refused too" "[[ ${status} -ne 0 ]] && grep -q 'Refusing to publish' ${HOME_DIR}/out.log"

echo "5) deploy.sh is rewritten by the pull while it is running"
new_home five; APP="${HOME_DIR}/apps/draconi"; make_checkout "${APP}"; mkdir -p "${HOME_DIR}/htdocs/draconi"
run_deploy "${APP}/deploy.sh" SIMULATE_SELF_UPDATE=1; status=$?
check "the running script is unaffected and finishes" "[[ ${status} -eq 0 ]] && ! grep -q SELF-UPDATE-EXECUTED ${HOME_DIR}/out.log"
check "the checkout copy really was rewritten" "grep -q SELF-UPDATE-EXECUTED ${APP}/deploy.sh"

echo "6) Incomplete build output stops the deploy before any restart"
new_home six; APP="${HOME_DIR}/apps/draconi"; make_checkout "${APP}"
sed -i.bak 's#echo png > dist/dragonbane-icon.png;##' "${SANDBOX}/bin/npm" && rm -f "${SANDBOX}/bin/npm.bak"
run_deploy "${APP}/deploy.sh"; status=$?
check "fails with a clear message" "[[ ${status} -ne 0 ]] && grep -q 'Build output is incomplete' ${HOME_DIR}/out.log"
check "API was not restarted" "! grep -q 'pm2 restart' ${SANDBOX_LOG}"

echo
if ((FAILURES > 0)); then echo "${FAILURES} check(s) failed"; exit 1; fi
echo "all deploy checks passed"
