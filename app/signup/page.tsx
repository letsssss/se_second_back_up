"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast, Toaster } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/utils/supabaseClient"
import KakaoLoginButton from "@/components/KakaoLoginButton"

export default function Signup() {
  const [agreed, setAgreed] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    
    // 비밀번호 일치 확인
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.")
      toast.error("비밀번호가 일치하지 않습니다.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log("회원가입 시도", { email, password, name })
      
      // 상대 경로 사용으로 포트 변경에 영향 받지 않음
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, name }),
      })

      // 응답이 JSON이 아닐 경우 처리
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error("JSON 파싱 오류:", jsonError);
        toast.error("서버 응답을 처리할 수 없습니다.");
        throw new Error("서버 응답을 처리할 수 없습니다.");
      }

      if (!response.ok) {
        toast.error(data?.error || "회원가입 중 오류가 발생했습니다.");
        throw new Error(data?.error || "회원가입 중 오류가 발생했습니다.")
      }

      // 회원가입 성공
      toast.success("회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.");
      
      // 1초 후 로그인 페이지로 이동 (토스트 메시지를 볼 수 있도록)
      setTimeout(() => {
        router.push("/login");
      }, 1000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입 중 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
      <Toaster position="top-center" />
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <Link href="/">
            <Image src="/placeholder.svg" alt="TICKETBAY" width={120} height={40} className="h-12 object-contain" />
          </Link>
        </div>

        {/* Back Button */}
        <div>
          <Link href="/login" className="flex items-center text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" />
            로그인으로 돌아가기
          </Link>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Kakao Signup Button */}
        <KakaoLoginButton mode="signup" text="카카오로 간편 가입하기" />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-50 text-gray-500">또는 이메일로 가입하기</span>
          </div>
        </div>

        {/* Signup Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              이메일
            </label>
            <Input 
              id="email" 
              type="email" 
              placeholder="example@email.com" 
              required 
              className="w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              이름
            </label>
            <Input 
              id="name" 
              type="text" 
              placeholder="이름을 입력해주세요" 
              className="w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <Input 
              id="password" 
              type="password" 
              placeholder="6자 이상 입력해주세요" 
              required 
              className="w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-gray-500">최소 6자 이상의 비밀번호를 입력해주세요.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              비밀번호 확인
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="비밀번호를 한번 더 입력해주세요"
              required
              className="w-full"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <div className="flex items-center">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked as boolean)}
              className="border-gray-300"
            />
            <label htmlFor="agree" className="ml-2 text-sm text-gray-600">
              <span className="font-medium text-gray-900">이용약관</span>과{" "}
              <span className="font-medium text-gray-900">개인정보 처리방침</span>에 동의합니다.
            </label>
          </div>

          <Button
            type="submit"
            className="w-full bg-black hover:bg-gray-800 text-white transition-colors"
            disabled={!agreed || loading}
          >
            {loading ? "처리 중..." : "회원가입"}
          </Button>
        </form>

        {/* Terms */}
        <div className="text-center text-sm text-gray-500">
          회원가입 시{" "}
          <Link href="#" className="text-blue-600 hover:underline">
            이용약관
          </Link>
          과{" "}
          <Link href="#" className="text-blue-600 hover:underline">
            개인정보 처리방침
          </Link>
          에 동의하게 됩니다.
        </div>
      </div>
    </div>
  )
}

