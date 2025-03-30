# 환경 변수 설정
$env:DATABASE_URL = "file:./dev.db"
$env:NEXT_PUBLIC_SUPABASE_URL = "https://jdubrjczdyqqtsppojgu.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdWJyamN6ZHlxcXRzcHBvamd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwNTE5NzcsImV4cCI6MjA1ODYyNzk3N30.rnmejhT40bzQ2sFl-XbBrme_eSLnxNBGe2SSt-R_3Ww"

# Prisma 클라이언트 생성
Write-Host "Prisma 클라이언트를 생성합니다..." -ForegroundColor Yellow
npx prisma db push --skip-generate
npx prisma generate

# 앱 실행
Write-Host "환경 변수가 설정되었습니다." -ForegroundColor Green
Write-Host "애플리케이션을 시작합니다..." -ForegroundColor Cyan
pnpm dev 