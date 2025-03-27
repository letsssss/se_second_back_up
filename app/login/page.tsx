"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/auth-context"
import { toast, Toaster } from "sonner"
import KakaoLoginButton from "@/components/KakaoLoginButton"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { login } = useAuth()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await login(email, password)

      if (result.success) {
        toast.success("로그인 성공! 홈페이지로 이동합니다.")
        // 로그인 성공 시 홈페이지로 리다이렉트 (토스트를 볼 수 있도록 약간 지연)
        setTimeout(() => {
          router.push("/")
        }, 800)
      } else {
        // 에러 처리
        toast.error(result.message || "로그인에 실패했습니다.")
      }
    } catch (error) {
      console.error("Login error:", error)
      toast.error("로그인 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <Toaster position="top-center" />
      <div className="w-full max-w-md space-y-10">
        {/* Logo */}
        <div className="flex justify-center">
          <Link href="/">
            <Image
              src="/placeholder.svg"
              alt="TICKETBAY"
              width={120}
              height={40}
              className="h-12 object-contain cursor-pointer"
            />
          </Link>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">아이디(이메일)</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@example.com"
              className="w-full border-gray-300"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">비밀번호</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border-gray-300"
              required
            />
          </div>

          <div className="flex items-center">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              className="border-gray-300"
            />
            <label htmlFor="remember" className="ml-2 text-sm text-gray-600">
              아이디 저장
            </label>
          </div>

          <Button
            type="submit"
            className="w-full bg-black hover:bg-gray-800 text-white py-2 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? "로그인 중..." : "로그인"}
          </Button>

          <KakaoLoginButton mode="login" />

          <Link href="/signup" className="block">
            <Button variant="outline" className="w-full border-gray-300 text-gray-700 py-2 transition-colors">
              이메일로 회원가입
            </Button>
          </Link>
        </form>

        {/* Social Login */}
        <div className="pt-8">
          <div className="flex justify-center space-x-12">
            <button className="flex flex-col items-center group">
              <div className="w-14 h-14 flex items-center justify-center bg-[#03C75A] rounded-full mb-2 group-hover:opacity-90 transition-opacity">
                <span className="text-white font-bold text-xl">N</span>
              </div>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">네이버</span>
            </button>

            <button className="flex flex-col items-center group">
              <div className="w-14 h-14 flex items-center justify-center border border-gray-300 rounded-full mb-2 group-hover:border-gray-400 transition-colors">
                <Image src="/placeholder.svg" alt="Google" width={28} height={28} />
              </div>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">Google</span>
            </button>

            <button className="flex flex-col items-center group">
              <div className="w-14 h-14 flex items-center justify-center bg-black rounded-full mb-2 group-hover:bg-gray-900 transition-colors">
                <Image src="/placeholder.svg" alt="Apple" width={28} height={28} className="invert" />
              </div>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">Apple</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

