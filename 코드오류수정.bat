@echo off
chcp 65001
echo hooks/useChat.ts 파일의 오류를 수정합니다...

cd /d C:\Users\jinseong\Desktop\se_second_back_up

:: 파일 내용 읽고 오류 부분 수정
powershell -Command "$file = 'hooks/useChat.ts'; $content = Get-Content $file -Raw; $fixedContent = $content -replace '    }\r\n    }', '    }'; $fixedContent = $content -replace '    }\n    }', '    }'; Set-Content -Path $file -Value $fixedContent -NoNewline"

echo 파일 수정이 완료되었습니다!
echo 이제 백업실행.bat 파일을 실행하여 백업을 진행하세요.
echo 아무 키나 누르면 창이 닫힙니다...
pause > nul 