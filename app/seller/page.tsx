'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function SellerRedirect() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 로컬 스토리지에서 사용자 정보 가져오기
    const getUserFromLocalStorage = () => {
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          return user;
        }
        return null;
      } catch (error) {
        console.error('로컬스토리지에서 사용자 정보를 가져오는 중 오류 발생:', error);
        return null;
      }
    };

    // 사용자 ID 가져오기
    const getCurrentUserId = async () => {
      // 1. 먼저 로컬 스토리지에서 확인
      const user = getUserFromLocalStorage();
      if (user && user.id) {
        return user.id.toString();
      }

      // 2. API를 통해 현재 로그인한 사용자 정보 가져오기
      try {
        // 인증 토큰 가져오기
        const authToken = localStorage.getItem('auth-token') || localStorage.getItem('token') || '';
        if (!authToken) {
          throw new Error('인증 토큰이 없습니다.');
        }

        const response = await fetch('/api/users/current', {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (!response.ok) {
          throw new Error('사용자 정보를 가져오는데 실패했습니다.');
        }

        const data = await response.json();
        if (data.success && data.user && data.user.id) {
          return data.user.id.toString();
        } else {
          throw new Error('사용자 ID를 찾을 수 없습니다.');
        }
      } catch (error) {
        console.error('사용자 정보를 가져오는 중 오류:', error);
        throw error;
      }
    };

    // 리디렉션 처리
    const redirectToSellerProfile = async () => {
      try {
        setIsLoading(true);
        const userId = await getCurrentUserId();
        
        if (userId) {
          router.push(`/seller/${userId}`);
        } else {
          setError('판매자 ID를 찾을 수 없습니다. 로그인이 필요합니다.');
          setIsLoading(false);
        }
      } catch (error: any) {
        setError(error.message || '리디렉션 중 오류가 발생했습니다.');
        setIsLoading(false);
      }
    };

    redirectToSellerProfile();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full text-center">
          <h1 className="text-red-600 text-xl font-semibold mb-2">오류가 발생했습니다</h1>
          <p className="text-gray-700 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            로그인 후 다시 시도해주세요. 문제가 계속되면 고객센터로 문의해주세요.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            로그인하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
        <h1 className="text-xl font-medium text-gray-900 mb-2">판매자 페이지로 이동 중...</h1>
        <p className="text-gray-500">잠시만 기다려주세요.</p>
      </div>
    </div>
  );
} 