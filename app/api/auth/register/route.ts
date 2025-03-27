// 타입 정의 추가
interface MemoryUser {
  id: number;
  email: string;
  name: string;
  role: string;
  [key: string]: any;
}

// global 타입 정의
declare global {
  var memoryUsers: MemoryUser[] | undefined;
}

import { NextResponse } from "next/server";
import { supabase } from "@/utils/supabaseClient";
import prisma from "@/lib/prisma";

// 이메일 유효성 검사 함수
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// OPTIONS 메서드 처리
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(request: Request) {
  try {
    // 요청 본문 파싱
    const { email, password, name } = await request.json();
    
    // 기본 유효성 검사
    if (!email || !password || !name) {
      return NextResponse.json({ error: "이메일, 비밀번호, 이름은 필수 입력값입니다." }, { status: 400 });
    }
    
    // 이메일 형식 검증
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "유효하지 않은 이메일 형식입니다." }, { status: 400 });
    }
    
    // 비밀번호 복잡도 검증 (최소 6자 이상)
    if (password.length < 6) {
      return NextResponse.json({ error: "비밀번호는 최소 6자 이상이어야 합니다." }, { status: 400 });
    }
    
    // 이메일을 소문자로 변환
    const emailLowerCase = email.toLowerCase();
    
    // Supabase 클라이언트 검증
    if (!supabase || !supabase.auth) {
      console.error("Supabase 클라이언트 초기화되지 않음");
      return NextResponse.json({ error: "내부 서버 오류가 발생했습니다." }, { status: 500 });
    }
    
    console.log("Supabase 정상 초기화 확인, auth.signUp 함수 유무:", !!supabase.auth.signUp);
    
    // 이메일 중복 검사: Supabase Auth에서 사용자 조회
    try {
      // Supabase에서 사용자 이메일 검색
      const { data: supabaseUser, error: supabaseError } = await supabase.auth.admin.listUsers();
      
      if (!supabaseError && supabaseUser) {
        const existingUser = supabaseUser.users.find(
          user => user.email?.toLowerCase() === emailLowerCase
        );
        
        if (existingUser) {
          console.log("이미 가입된 이메일:", emailLowerCase);
          return NextResponse.json({ 
            error: "이미 가입된 이메일입니다. 로그인을 시도하거나 다른 이메일을 사용해 주세요." 
          }, { status: 400 });
        }
      }
      
      // Prisma에서도 이메일 중복 확인 (Supabase와 연동되지 않은 계정 확인)
      const existingDbUser = await prisma.user.findUnique({
        where: { email: emailLowerCase }
      });
      
      if (existingDbUser) {
        console.log("Prisma DB에 이미 존재하는 이메일:", emailLowerCase);
        return NextResponse.json({ 
          error: "이미 가입된 이메일입니다. 로그인을 시도하거나 다른 이메일을 사용해 주세요." 
        }, { status: 400 });
      }
    } catch (checkError) {
      console.error("이메일 중복 검사 중 오류:", checkError);
      // 중복 검사 실패는 회원가입 시도에 영향을 주지 않도록 처리 (진행 허용)
    }
    
    // 1. Supabase Auth에 사용자 등록
    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailLowerCase,
        password,
        options: {
          data: { 
            name,
            role: "USER"
          }
        }
      });
      
      if (error) {
        // Supabase 오류 메시지 맞춤화
        let errorMessage = error.message;
        if (error.message.includes("already registered")) {
          errorMessage = "이미 가입된 이메일입니다. 로그인 페이지에서 로그인해 주세요.";
        }
        
        console.error("Supabase Auth 등록 오류:", errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
      
      const userId = data.user?.id;
      if (!userId) {
        return NextResponse.json({ error: "사용자 생성 실패" }, { status: 500 });
      }
      
      console.log("Supabase Auth 사용자 생성 완료:", userId);
      
      // 2. Supabase public.users 테이블에 사용자 정보 저장
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: emailLowerCase,
          name,
          role: "USER"
        });
      
      if (insertError) {
        console.error("Supabase 데이터 테이블 저장 오류:", insertError.message);
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
      
      console.log("Supabase 데이터 테이블에 사용자 정보 저장 성공");
      
      // 3. 성공 응답 반환
      return NextResponse.json({
        success: true,
        message: "회원가입이 완료되었습니다.",
        user: { 
          id: userId, 
          email: emailLowerCase, 
          name 
        }
      }, { status: 201 });
    } catch (signUpError) {
      console.error("Supabase Auth.signUp 호출 중 오류:", signUpError);
      return NextResponse.json({ 
        error: "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("회원가입 처리 오류:", error);
    return NextResponse.json({ 
      error: "회원가입 중 오류가 발생했습니다.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
} 