"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function EditProfilePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  const [userData, setUserData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    bankName: "",
    accountNumber: "",
    accountHolder: "",
  });

  // 브라우저 스토리지에서 직접 토큰 확인하는 함수
  const checkStoredToken = () => {
    if (typeof window === 'undefined') return null;
    
    try {
      // 로컬 스토리지에서 확인
      const localToken = localStorage.getItem('token');
      if (localToken) {
        console.log('로컬 스토리지 토큰 존재:', localToken.substring(0, 20) + '...');
        return localToken;
      }
      
      // 세션 스토리지에서 확인
      const sessionToken = sessionStorage.getItem('token');
      if (sessionToken) {
        console.log('세션 스토리지 토큰 존재:', sessionToken.substring(0, 20) + '...');
        return sessionToken;
      }
      
      console.log('스토리지에 토큰이 없음');
      return null;
    } catch (e) {
      console.error('토큰 확인 오류:', e);
      return null;
    }
  };

  // 페이지 로드 시 사용자 데이터 가져오기
  useEffect(() => {
    // 현재 인증 상태 확인
    console.log("현재 인증 상태:", !!user);
    const storedToken = checkStoredToken();
    
    if (!user) {
      toast.error("로그인이 필요한 페이지입니다");
      router.push("/login?callbackUrl=/mypage/edit-profile");
      return;
    }

    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        // 토큰 로깅
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        console.log("요청에 사용할 토큰:", token ? '존재함' : '없음');
        
        // credentials 옵션 추가 및 캐시 방지 헤더 설정
        const timestamp = Date.now();
        const response = await fetch(`/api/user/update-profile?t=${timestamp}`, {
          method: "GET",
          credentials: "include", // 쿠키를 포함시켜 요청
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          }
        });
        
        console.log("프로필 정보 요청 응답 상태:", response.status);
        
        if (!response.ok) {
          // 인증 오류인 경우 로그인 페이지로 리다이렉트
          if (response.status === 401) {
            toast.error("인증 세션이 만료되었습니다. 다시 로그인해 주세요.");
            router.push("/login?callbackUrl=/mypage/edit-profile");
            return;
          }
          throw new Error("사용자 정보를 가져오는데 실패했습니다");
        }
        
        const data = await response.json();
        
        if (data.success) {
          // 기본 사용자 정보 설정
          setUserData({
            name: data.user.name || "",
            email: data.user.email || "",
            phoneNumber: data.user.phoneNumber || "",
            // 계좌 정보가 있으면 설정
            bankName: data.user.bankInfo?.bankName || "",
            accountNumber: data.user.bankInfo?.accountNumber || "",
            accountHolder: data.user.bankInfo?.accountHolder || "",
          });
        } else {
          toast.error(data.message || "사용자 정보를 가져오는데 실패했습니다");
        }
      } catch (error) {
        console.error("사용자 정보 로딩 오류:", error);
        toast.error("사용자 정보를 가져오는데 실패했습니다");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [user, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUserData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // 토큰 로깅
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      console.log("요청에 사용할 토큰:", token ? '존재함' : '없음');
      
      // credentials 옵션 추가 및 캐시 방지 헤더 설정
      const timestamp = Date.now();
      const response = await fetch(`/api/user/update-profile?t=${timestamp}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        credentials: "include", // 쿠키를 포함시켜 요청
        body: JSON.stringify({
          name: userData.name,
          phoneNumber: userData.phoneNumber,
          bankName: userData.bankName,
          accountNumber: userData.accountNumber,
          accountHolder: userData.accountHolder,
        }),
      });
      
      // 응답 상태 로깅
      console.log("프로필 수정 요청 응답 상태:", response.status);
      
      // 인증 오류 처리
      if (response.status === 401) {
        toast.error("인증 세션이 만료되었습니다. 다시 로그인해 주세요.");
        router.push("/login?callbackUrl=/mypage/edit-profile");
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast.success("프로필이 성공적으로 수정되었습니다");
        router.push("/mypage");
      } else {
        toast.error(data.message || "프로필 수정에 실패했습니다");
      }
    } catch (error) {
      console.error("프로필 수정 오류:", error);
      toast.error("프로필 수정 중 오류가 발생했습니다");
    } finally {
      setIsSaving(false);
    }
  };

  // 로딩 중인 경우 로딩 표시
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>사용자 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <Link href="/mypage" className="flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5 mr-2" />
            <span>마이페이지로 돌아가기</span>
          </Link>
          <h1 className="text-3xl font-bold mt-4">프로필 수정</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                이름
              </label>
              <Input id="name" name="name" type="text" value={userData.name} onChange={handleChange} required />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                이메일 (변경 불가)
              </label>
              <Input id="email" name="email" type="email" value={userData.email} disabled className="bg-gray-100" />
            </div>

            <div>
              <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
                휴대폰번호
              </label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                value={userData.phoneNumber}
                onChange={handleChange}
                placeholder="'-' 없이 입력해주세요"
              />
            </div>

            {/* 계좌 정보 섹션 추가 */}
            <div className="pt-4 border-t mt-6">
              <h3 className="text-lg font-medium text-gray-700 mb-4">계좌 정보</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-1">
                    은행명
                  </label>
                  <Input
                    id="bankName"
                    name="bankName"
                    type="text"
                    value={userData.bankName}
                    onChange={handleChange}
                    placeholder="예: 신한은행, 국민은행"
                  />
                </div>

                <div>
                  <label htmlFor="accountNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    계좌번호
                  </label>
                  <Input
                    id="accountNumber"
                    name="accountNumber"
                    type="text"
                    value={userData.accountNumber}
                    onChange={handleChange}
                    placeholder="'-' 없이 입력해주세요"
                  />
                </div>

                <div>
                  <label htmlFor="accountHolder" className="block text-sm font-medium text-gray-700 mb-1">
                    예금주명
                  </label>
                  <Input
                    id="accountHolder"
                    name="accountHolder"
                    type="text"
                    value={userData.accountHolder}
                    onChange={handleChange}
                    placeholder="예금주명을 입력해주세요"
                  />
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-[#0061FF] hover:bg-[#0052D6] text-white"
              disabled={isSaving}
            >
              {isSaving ? "저장 중..." : "변경사항 저장"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}

