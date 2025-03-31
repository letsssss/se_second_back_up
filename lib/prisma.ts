import { PrismaClient } from '@prisma/client';

// PrismaClient를 글로벌 변수로 선언하여 핫 리로드 시 여러 인스턴스가 생성되는 것 방지
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 개발 환경에서 사용할 데이터베이스 URL (SQLite)
const databaseUrl = 'file:./dev.db';

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