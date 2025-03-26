@echo off
chcp 65001
echo 강제 백업 과정을 시작합니다...

cd /d C:\Users\jinseong\Desktop\se_second_back_up

:: Git 환경 변수 설정 - 페이징 문제 해결
set GIT_PAGER=
set PAGER=

:: GitHub 접근을 위한 토큰/비밀번호 확인
echo GitHub 계정이 필요합니다. 잠시 후 인증 창이 뜨면 로그인하세요.
echo 계속하려면 아무 키나 누르세요...
pause > nul

:: hooks/useChat.ts 파일의 787줄 중괄호 오류 강제 수정
echo 1/5 단계: hooks/useChat.ts 파일 오류 강제 수정 중...
powershell -Command "$file = 'hooks/useChat.ts'; if (Test-Path $file) { $content = Get-Content $file -Raw; $fixed = $content -replace '    }\r?\n    }', '    }'; $fixed = $fixed -replace '    }\n    }', '    }'; Set-Content -Path $file -Value $fixed -NoNewline; Write-Host '파일 수정 완료!' } else { Write-Host '파일을 찾을 수 없습니다.' }"

:: 변경된 파일 상태 확인
echo 2/5 단계: 변경된 파일 확인 중...
git status --short

:: 모든 변경 사항 강제 스테이징
echo 3/5 단계: 모든 파일 강제 스테이징 중...
git add -A --force

:: 커밋 메시지로 변경사항 저장
echo 4/5 단계: 변경사항 강제 커밋 중...
git commit -m "채팅 인터페이스: 메시지 읽음 표시 기능 개선 및 버그 수정" --allow-empty

:: GitHub에 강제 푸시
echo 5/5 단계: GitHub에 변경사항 강제 푸시 중...
git push -f origin master

echo.
echo 백업 결과 확인:
git log -1 --oneline

echo.
echo 강제 백업 과정이 완료되었습니다!
echo 아무 키나 누르면 창이 닫힙니다...
pause > nul 