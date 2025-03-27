"use client"

import { createContext, useContext, useState, useEffect, type ReactNode, useCallback, useRef } from "react"
import { toast } from "sonner"
import { usePathname, useRouter } from "next/navigation"

// 브라우저 환경인지 확인하는 헬퍼 함수
const isBrowser = () => typeof window !== 'undefined';

// 로컬 스토리지에 안전하게 저장하는 함수
const safeLocalStorageSet = (key: string, value: string) => {
  if (isBrowser()) {
    try {
      localStorage.setItem(key, value);
      // Edge 브라우저 호환성을 위해 sessionStorage에도 저장
      sessionStorage.setItem(key, value);
      // 추가 백업으로 document.cookie에도 저장 (httpOnly 아님)
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${7 * 24 * 60 * 60}`;
    } catch (e) {
      console.error("로컬 스토리지 저장 오류:", e);
    }
  }
};

// 로컬 스토리지에서 안전하게 가져오는 함수
const safeLocalStorageGet = (key: string) => {
  if (isBrowser()) {
    try {
      // 먼저 localStorage 확인
      let value = localStorage.getItem(key);
      if (value) return value;
      
      // localStorage에 없으면 sessionStorage 확인
      value = sessionStorage.getItem(key);
      if (value) return value;
      
      // sessionStorage에도 없으면 cookie 확인
      const cookies = document.cookie.split('; ');
      const cookie = cookies.find(row => row.startsWith(`${key}=`));
      if (cookie) {
        return decodeURIComponent(cookie.split('=')[1]);
      }
      
      return null;
    } catch (e) {
      console.error("스토리지 접근 오류:", e);
      return null;
    }
  }
  return null;
};

// 로컬 스토리지에서 안전하게 삭제하는 함수
const safeLocalStorageRemove = (key: string) => {
  if (isBrowser()) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    } catch (e) {
      console.error("스토리지 삭제 오류:", e);
    }
  }
};

type User = {
  id: number
  email: string
  name: string
  role?: string
}

type AuthContextType = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  checkAuthStatus: () => Promise<boolean>
  socialLogin: (provider: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// 보호된 경로 목록
const PROTECTED_ROUTES = [
  '/proxy-ticketing',
  '/ticket-cancellation',
  '/tickets',
];

// 스토리지에서 초기 사용자 정보 가져오기
const getInitialUser = (): User | null => {
  const storedUser = safeLocalStorageGet("user");
  if (storedUser) {
    try {
      return JSON.parse(storedUser);
    } catch (e) {
      console.error("사용자 정보 파싱 오류:", e);
    }
  }
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  // 초기 사용자 정보를 스토리지에서 가져와 설정
  const [user, setUser] = useState<User | null>(getInitialUser())
  const [isLoading, setIsLoading] = useState(false)
  const [lastChecked, setLastChecked] = useState<number>(Date.now())
  
  // 인증 상태 확인 중인지 여부를 추적하는 ref
  const isCheckingRef = useRef<boolean>(false)
  // 마지막 요청 시간 추적
  const lastRequestRef = useRef<number>(0)
  
  const router = useRouter()
  const pathname = usePathname()

  // 브라우저 스토리지에서 사용자 정보 확인 및 설정
  const getUserFromStorage = useCallback(() => {
    if (!isBrowser()) return null;
    
    const storedUser = safeLocalStorageGet("user");
    if (!storedUser) return null;
    
    try {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      return parsedUser;
    } catch (e) {
      console.error("사용자 정보 파싱 오류:", e);
      return null;
    }
  }, []);

  // 인증 상태 확인 함수
  const checkAuthStatus = useCallback(async (): Promise<boolean> => {
    // 브라우저 환경이 아니면 false 반환
    if (!isBrowser()) return false;
    
    // 이미 확인 중이면 사용자 존재 여부 반환
    if (isCheckingRef.current) {
      console.log("이미 인증 확인 중...");
      return !!user;
    }
    
    // 최근 2초 이내에 확인한 경우 스킵
    const now = Date.now();
    if (now - lastRequestRef.current < 2000) {
      console.log("너무 빈번한 요청, 스킵");
      return !!user;
    }
    
    // 사용자가 있고 15초 이내에 확인한 경우 바로 true 반환
    if (user && now - lastChecked < 15000) {
      console.log("최근에 이미 확인됨, 재확인 스킵");
      return true;
    }
    
    // 확인 중 상태로 설정하고 시간 갱신
    isCheckingRef.current = true;
    lastRequestRef.current = now;
    
    try {
      console.log("인증 상태 확인 중...");
      
      // 먼저 로컬 스토리지에서 토큰 확인
      const storedToken = safeLocalStorageGet("token");
      if (!storedToken) {
        console.log("토큰 없음");
        isCheckingRef.current = false;
        return false;
      }
      
      // 토큰 유효성 확인 (서버에 요청)
      console.log("서버에 토큰 유효성 확인 요청");
      const timestamp = now; // 캐시 방지를 위한 타임스탬프
      const response = await fetch(`/api/auth/me?t=${timestamp}`, {
        method: "GET",
        credentials: "include", // 쿠키 포함
        headers: {
          "Authorization": `Bearer ${storedToken}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
        cache: "no-store", // 캐시 사용 방지
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          console.log("서버에서 사용자 정보 확인됨");
          
          // 사용자 정보 업데이트
          const userData = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name || "사용자",
            role: data.user.role,
          };
          
          safeLocalStorageSet("user", JSON.stringify(userData));
          if (data.token) {
            safeLocalStorageSet("token", data.token);
          }
          
          setUser(userData);
          setLastChecked(now);
          isCheckingRef.current = false;
          return true;
        }
      }
      
      // 응답이 성공적이지 않거나 사용자 정보가 없는 경우
      console.log("인증 실패");
      isCheckingRef.current = false;
      return false;
      
    } catch (error) {
      console.error("인증 상태 확인 오류:", error);
      isCheckingRef.current = false;
      return false;
    }
  }, [user, lastChecked]);

  // 보호된 경로에 대한 인증 확인 및 리다이렉트
  useEffect(() => {
    if (!isBrowser() || !pathname) return;
    
    const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
    if (!isProtectedRoute) return;
    
    // 로딩 중이면 스킵
    if (isLoading) return;
    
    const verifyAuth = async () => {
      console.log(`보호된 경로 확인: ${pathname}`);
      
      // 이미 사용자 정보가 있으면 바로 반환
      if (user) {
        console.log("사용자 정보 있음, 접근 허용");
        return;
      }
      
      // 사용자가 없으면 스토리지에서 한 번 더 확인
      getUserFromStorage();
      
      // 그래도 없으면 인증 상태 확인
      setIsLoading(true);
      const isAuthenticated = await checkAuthStatus();
      setIsLoading(false);
      
      if (!isAuthenticated) {
        console.log("인증되지 않음: 로그인 페이지로 리다이렉트");
        router.push(`/login?callbackUrl=${pathname}`);
      }
    };
    
    verifyAuth();
  }, [pathname, user, router, getUserFromStorage, checkAuthStatus, isLoading]);

  // 초기 로드 시 사용자 정보 확인
  useEffect(() => {
    if (!isBrowser()) return;
    
    // 이미 사용자 정보가 있으면 스킵
    if (user) return;
    
    // 스토리지에서 다시 한 번 확인
    getUserFromStorage();
  }, [user, getUserFromStorage]);

  // 로그인 함수
  const login = async (email: string, password: string) => {
    try {
      // 로딩 상태 설정
      setIsLoading(true);
      
      // 상대 경로 사용으로 포트 변경에 영향 받지 않음
      const timestamp = new Date().getTime(); // 캐시 방지를 위한 타임스탬프
      const response = await fetch(`/api/auth/login?t=${timestamp}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
        body: JSON.stringify({ email, password }),
        credentials: "include", // 쿠키를 포함시키기 위해 필요
        cache: "no-store", // 캐시 사용 방지
      });

      // 응답이 JSON이 아닐 경우 처리
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error("JSON 파싱 오류:", jsonError);
        setIsLoading(false);
        return {
          success: false, 
          message: "서버 응답을 처리할 수 없습니다."
        };
      }

      // 로딩 상태 해제
      setIsLoading(false);

      if (!response.ok) {
        return {
          success: false,
          message: data?.error || "로그인 중 오류가 발생했습니다.",
        };
      }

      // 로그인 성공
      const userData = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name || "사용자",
        role: data.user.role,
      };

      // 로컬 스토리지에 사용자 정보 저장
      safeLocalStorageSet("user", JSON.stringify(userData));
      safeLocalStorageSet("token", data.token); // 토큰 저장
      setUser(userData);
      
      // 마지막 확인 시간 업데이트
      setLastChecked(Date.now());

      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      setIsLoading(false);
      return {
        success: false,
        message: "로그인 중 오류가 발생했습니다.",
      };
    }
  };

  // 로그아웃 함수
  const logout = async () => {
    try {
      setIsLoading(true);
      
      // 토큰 가져오기
      const token = safeLocalStorageGet("token");
      
      // 쿠키 제거 요청 (백엔드에서 처리)
      try {
        const timestamp = new Date().getTime(); // 캐시 방지를 위한 타임스탬프
        await fetch(`/api/auth/logout?t=${timestamp}`, {
          method: "POST",
          headers: token ? {
            "Authorization": `Bearer ${token}`,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
          } : {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
          },
          credentials: "include", // 쿠키 포함
          cache: "no-store", // 캐시 사용 방지
        });
      } catch (error) {
        console.error("로그아웃 API 오류:", error);
      }

      // 로컬 스토리지에서 사용자 정보 및 토큰 제거
      safeLocalStorageRemove("user");
      safeLocalStorageRemove("token");
      
      // 사용자 정보 초기화
      setUser(null);
      setIsLoading(false);
      toast.success("로그아웃 되었습니다.");
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false);
      toast.error("로그아웃 중 오류가 발생했습니다.");
    }
  };

  // 소셜 로그인 함수 추가
  const socialLogin = async (provider: string) => {
    try {
      setIsLoading(true);
      // Supabase 연동은 KakaoLoginButton 컴포넌트에서 직접 처리
      console.log(`${provider} 로그인 시작`);
    } catch (error) {
      console.error(`${provider} 로그인 오류:`, error);
      toast.error(`${provider} 로그인 중 오류가 발생했습니다.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        checkAuthStatus,
        socialLogin
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// 커스텀 훅으로 AuthContext 사용하기 쉽게 만들기
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

