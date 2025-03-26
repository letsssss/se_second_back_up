# Git 백업 스크립트
Set-Location -Path "C:\Users\jinseong\Desktop\se_second_back_up"

# Git 환경 변수 설정 - 페이징 비활성화
$env:GIT_PAGER = ""
$env:PAGER = ""

# hooks/useChat.ts 파일 수정 - 787줄의 추가 중괄호 제거
$filePath = "hooks/useChat.ts"
$content = Get-Content $filePath -Raw
$fixedContent = $content -replace "    }\n    }", "    }"
Set-Content -Path $filePath -Value $fixedContent -NoNewline

# 변경된 파일 추가
git add -A

# 커밋 메시지로 변경사항 저장
git commit -m "채팅 인터페이스: 메시지 읽음 표시 기능 개선 및 버그 수정" --no-pager

# GitHub에 푸시
git push origin master --porcelain

Write-Host "백업이 완료되었습니다." 