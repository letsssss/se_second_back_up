@echo off
chcp 65001
echo 백업을 시작합니다...

cd /d C:\Users\jinseong\Desktop\se_second_back_up

:: Git 환경 변수 설정
set GIT_PAGER=
set PAGER=

:: hooks/useChat.ts 파일 수정
powershell -Command "$content = Get-Content 'hooks/useChat.ts' -Raw; $fixedContent = $content -replace '    }\r\n    }', '    }'; Set-Content -Path 'hooks/useChat.ts' -Value $fixedContent -NoNewline"

:: 변경된 파일 추가
git add .

:: 커밋 메시지로 변경사항 저장
git commit -m "채팅 인터페이스: 메시지 읽음 표시 기능 개선 및 버그 수정"

:: GitHub에 푸시
git push origin master

echo 백업이 완료되었습니다!
echo 아무 키나 누르면 창이 닫힙니다...
pause > nul 