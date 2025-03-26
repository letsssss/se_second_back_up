@echo off
chcp 65001
echo 강제 백업을 시작합니다...

cd /d C:\Users\jinseong\Desktop\se_second_back_up

:: Git 환경 변수 설정
set GIT_PAGER=
set PAGER=

:: 변경된 파일 상태 확인
echo 변경된 파일 상태:
git status --short

:: 모든 파일 강제 추가
git add -A

:: 커밋 메시지로 변경사항 저장
git commit -m "채팅 인터페이스: 메시지 읽음 표시 기능 개선 및 버그 수정"

:: GitHub에 강제 푸시
git push -f origin master

echo 강제 백업이 완료되었습니다!
echo 아무 키나 누르면 창이 닫힙니다...
pause > nul 