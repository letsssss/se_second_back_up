import { PrismaClient } from '@prisma/client';

// PrismaClient를 글로벌 변수로 선언하여 핫 리로드 시 여러 인스턴스가 생성되는 것 방지
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 환경 변수 또는 기본값 사용
const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';

// 디버깅을 위해 사용 중인 DB URL 출력
console.log('사용 중인 데이터베이스 URL:', databaseUrl);

// 싱글톤 패턴으로 Prisma 클라이언트 인스턴스 생성
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'error', 'warn'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

// 개발 환경에서만 전역 변수에 할당
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma; 