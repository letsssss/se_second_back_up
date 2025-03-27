import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";

// CORS 헤더 추가 함수
function addCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

// 특정 ID의 사용자 정보를 가져오는 API
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = await params.id;
    console.log(`사용자 정보 조회 API 호출됨 - ID: ${id}`);
    
    // ID가 숫자인지 확인
    const userId = parseInt(id);
    if (isNaN(userId)) {
      return addCorsHeaders(
        NextResponse.json(
          { success: false, message: "유효하지 않은 사용자 ID입니다." },
          { status: 400 }
        )
      );
    }

    // 데이터베이스에서 사용자 정보 조회
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        profileImage: true,
        role: true,
        createdAt: true,
        // 비밀번호 등 민감한 정보는 제외
      },
    });

    if (!user) {
      return addCorsHeaders(
        NextResponse.json(
          { success: false, message: "해당 사용자를 찾을 수 없습니다." },
          { status: 404 }
        )
      );
    }

    // 사용자 정보 반환
    return addCorsHeaders(
      NextResponse.json({
        success: true,
        user
      })
    );
  } catch (error) {
    console.error("사용자 정보 조회 오류:", error);
    return addCorsHeaders(
      NextResponse.json(
        { success: false, message: "사용자 정보를 가져오는 중 오류가 발생했습니다." },
        { status: 500 }
      )
    );
  }
} 