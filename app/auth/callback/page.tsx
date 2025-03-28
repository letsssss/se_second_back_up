"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { toast } from 'sonner';

// 인증 컨텍스트에서 필요한 함수만 가져오기
import { useAuth } from '@/contexts/auth-context';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("로그인 처리 중...");
  
  // 인증 컨텍스트에서 checkAuthStatus 가져오기
  const { checkAuthStatus } = useAuth();

  useEffect(() => {
    // 카카오 로그인 처리 함수
    const handleAuthCallback = async () => {
      try {
        // 해시 파라미터 확인
        if (typeof window === 'undefined' || !window.location.hash) {
          console.error('인증 파라미터가 없습니다.');
          setError('인증 정보를 찾을 수 없습니다.');
          return;
        }

        console.log('인증 콜백 처리 시작, 해시:', window.location.hash);
        
        // Supabase 세션 설정 (해시를 통해 인증 처리)
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('세션 가져오기 오류:', sessionError.message);
          setError(`인증 처리 중 오류: ${sessionError.message}`);
          return;
        }

        // 세션이 없거나 사용자 정보가 없는 경우
        if (!data.session || !data.session.user) {
          console.error('유효한 세션이 없습니다.');
          setError('로그인에 실패했습니다. 다시 시도해 주세요.');
          return;
        }

        console.log('세션 정보 확인됨:', data.session.user.id);
        
        // 로그인 모드 가져오기 (로컬 스토리지에 저장된 값)
        const authMode = localStorage.getItem('kakao_auth_mode') || 'login';
        console.log('인증 모드:', authMode);
        
        // 사용자 정보 가져오기
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) {
          console.error('사용자 정보 가져오기 오류:', userError.message);
          setError(`사용자 정보를 가져오는 중 오류가 발생했습니다.`);
          return;
        }

        const userEmail = userData.user?.email;
        console.log('사용자 이메일:', userEmail);
        
        // 사용자 이메일 체크
        if (userEmail) {
          // Supabase users 테이블에서 해당 이메일의 사용자 확인
          const { data: existingUsers, error: dbError } = await supabase
            .from('users')
            .select('*')
            .eq('email', userEmail);
          
          // 이메일로 가입된 계정이 없고 회원가입 모드인 경우, 유저 테이블에 저장
          if (!dbError && (!existingUsers || existingUsers.length === 0) && authMode === 'signup') {
            setStatusMessage("계정 정보 저장 중...");
            
            // 사용자 정보 추출
            const { data: userMeta } = await supabase.auth.getUser();
            const userId = userMeta.user?.id;
            const displayName = userMeta.user?.user_metadata?.full_name || '사용자';
            
            if (userId) {
              // users 테이블에 사용자 정보 저장
              const { error: insertError } = await supabase
                .from('users')
                .insert({
                  id: userId,
                  email: userEmail,
                  name: displayName,
                  role: "USER"
                });
              
              if (insertError) {
                console.error('사용자 정보 저장 오류:', insertError);
                // 오류가 있어도 계속 진행 (로그인은 가능)
              } else {
                console.log('사용자 정보가 성공적으로 저장되었습니다.');
              }
            }
          } else if (existingUsers && existingUsers.length > 0) {
            // 이미 존재하는 계정
            console.log('이미 가입된 이메일입니다.');
          }
        }
        
        // 세션 및 사용자 정보 저장
        if (data.session && data.session.user) {
          // 사용자 정보 로컬 스토리지에 저장
          localStorage.setItem('user', JSON.stringify({
            id: data.session.user.id,
            email: data.session.user.email,
            name: data.session.user.user_metadata?.full_name || '사용자',
          }));
          
          // Supabase 토큰 저장
          localStorage.setItem('supabase_token', data.session.access_token);
          
          // JWT 토큰 형식으로도 토큰 저장 (다른 API와의 호환성을 위해)
          localStorage.setItem('token', data.session.access_token);
          
          localStorage.setItem('auth_status', 'authenticated');
          
          // 시스템 JWT 토큰을 가져오기 위한 API 호출
          try {
            setStatusMessage("추가 인증 정보 가져오는 중...");
            const jwtResponse = await fetch('/api/auth/kakao-token', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                supabaseUserId: data.session.user.id,
                email: data.session.user.email
              })
            });
            
            if (jwtResponse.ok) {
              const jwtData = await jwtResponse.json();
              if (jwtData.token) {
                // 시스템 JWT 토큰 저장
                localStorage.setItem('token', jwtData.token);
                console.log('JWT 토큰이 성공적으로 저장되었습니다.');
              }
            }
          } catch (jwtError) {
            console.error('JWT 토큰 가져오기 오류:', jwtError);
            // JWT 오류가 있어도 로그인 진행
          }
          
          // 인증 상태 강제 업데이트
          await checkAuthStatus();
          
          console.log('로그인 성공, 홈페이지로 리디렉션...');
          toast.success('로그인 성공!');
          
          // 로컬 스토리지에서 모드 삭제
          localStorage.removeItem('kakao_auth_mode');
          
          // 인증 관련 이벤트 발생시키기 (전역에서 인증 상태 변화 감지)
          if (typeof window !== 'undefined') {
            const authEvent = new CustomEvent('auth-state-change', {
              detail: { authenticated: true }
            });
            window.dispatchEvent(authEvent);
          }
          
          // 1초 지연 후 홈페이지로 리디렉션
          setTimeout(() => {
            router.push('/');
            // 페이지 완전히 새로고침
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }, 100);
          }, 1000);
        } else {
          setError('로그인 처리 중 오류가 발생했습니다.');
        }
      } catch (err) {
        console.error('인증 콜백 처리 중 오류:', err);
        setError('인증 처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
      }
    };

    handleAuthCallback();
  }, [router, checkAuthStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      {error ? (
        <div className="text-center p-6 bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-red-600">로그인 오류</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <button 
            onClick={() => router.push('/login')}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
          >
            로그인 페이지로 돌아가기
          </button>
        </div>
      ) : (
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-4">{statusMessage}</h2>
          <div className="w-12 h-12 border-4 border-t-blue-500 border-b-blue-500 border-l-transparent border-r-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">잠시만 기다려 주세요. 곧 홈페이지로 이동합니다.</p>
        </div>
      )}
    </div>
  );
} 