"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowDown, ArrowUp, ShoppingCart, Tag, Filter, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from "@/components/ui/button"
import { WithdrawModal } from "@/components/withdraw-modal"

// API 기본 URL 설정 (환경별로 다른 호스트 사용)
const API_BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

// 트랜잭션 타입 정의
type TransactionType = "입금" | "출금" | "구매" | "판매"
type FilterType = "전체" | TransactionType

interface Transaction {
  id: number
  date: string
  description: string
  type: TransactionType
  amount: number
}

// 임시 거래내역 데이터
const transactions: Transaction[] = [
  {
    id: 1,
    date: "2024-03-15",
    description: "세븐틴 콘서트 티켓 판매",
    type: "판매",
    amount: 165000,
  },
  {
    id: 2,
    date: "2024-03-10",
    description: "예치금 출금",
    type: "출금",
    amount: -50000,
  },
  {
    id: 3,
    date: "2024-03-05",
    description: "데이식스 콘서트 티켓 구매",
    type: "구매",
    amount: -99000,
  },
  {
    id: 4,
    date: "2024-02-28",
    description: "예치금 충전",
    type: "입금",
    amount: 200000,
  },
  {
    id: 5,
    date: "2024-02-20",
    description: "아이브 팬미팅 티켓 판매",
    type: "판매",
    amount: 88000,
  },
  {
    id: 6,
    date: "2024-02-15",
    description: "뉴진스 콘서트 티켓 구매",
    type: "구매",
    amount: -120000,
  },
  {
    id: 7,
    date: "2024-02-10",
    description: "예치금 충전",
    type: "입금",
    amount: 100000,
  },
]

// 거래 유형별 아이콘 및 색상 설정
const typeConfig = {
  입금: { icon: ArrowDown, color: "text-blue-600", bgColor: "bg-blue-100" },
  출금: { icon: ArrowUp, color: "text-red-600", bgColor: "bg-red-100" },
  구매: { icon: ShoppingCart, color: "text-red-600", bgColor: "bg-red-100" },
  판매: { icon: Tag, color: "text-blue-600", bgColor: "bg-blue-100" },
}

export default function DepositHistory() {
  const [period, setPeriod] = useState("1개월")
  const [type, setType] = useState<FilterType>("전체")
  const [currentPage, setCurrentPage] = useState(1)
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)

  // 페이지당 표시할 거래 수
  const itemsPerPage = 5

  // 필터링된 거래내역
  const filteredTransactions = transactions.filter((transaction) => {
    if (type === "전체") return true
    return transaction.type === type
  })

  // 페이지네이션
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // 총 예치금 계산 (실제로는 API에서 가져와야 함)
  const totalBalance = transactions.reduce((sum, transaction) => sum + transaction.amount, 0)

  // 거래 유형별 아이콘 렌더링
  const renderTypeIcon = (type: TransactionType) => {
    const config = typeConfig[type]
    if (!config) return null

    const Icon = config.icon
    return (
      <div className={`p-2 rounded-full ${config.bgColor}`}>
        <Icon className={`h-4 w-4 ${config.color}`} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <Link href="/mypage" className="flex items-center text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5 mr-2" />
            <span>마이페이지로 돌아가기</span>
          </Link>
          <h1 className="text-3xl font-bold mt-4">예치금 거래내역</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 예치금 정보 카드 */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-6 border-l-4 border-[#0061FF]">
            <h2 className="text-lg font-medium text-gray-700 mb-1">현재 예치금</h2>
            <p className="text-2xl font-bold text-[#0061FF]">{totalBalance.toLocaleString()}원</p>
            <div className="flex justify-end mt-4">
              <Button
                className="bg-[#FFD600] hover:bg-[#FFE600] text-black px-5 py-2"
                onClick={() => setIsWithdrawModalOpen(true)}
              >
                출금 신청
              </Button>
            </div>
          </div>
        </div>

        {/* 필터 섹션 */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              {/* 기간 필터 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <Filter className="h-4 w-4 mr-1" /> 조회 기간
                </h3>
                <div className="flex space-x-2">
                  {["1개월", "3개월", "6개월", "1년"].map((p) => (
                    <button
                      key={p}
                      className={`px-3 py-1 text-sm rounded-full ${
                        period === p ? "bg-[#0061FF] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      onClick={() => setPeriod(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* 거래 유형 필터 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">거래 유형</h3>
                <div className="flex space-x-2">
                  {["전체", "입금", "출금", "구매", "판매"].map((t) => (
                    <button
                      key={t}
                      className={`px-3 py-1 text-sm rounded-full ${
                        type === t ? "bg-[#0061FF] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      onClick={() => setType(t as FilterType)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 거래내역 테이블 */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    날짜
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    내용
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    거래 유형
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    금액
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedTransactions.length > 0 ? (
                  paginatedTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(transaction.date).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{transaction.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center">
                          {renderTypeIcon(transaction.type)}
                          <span className="ml-2">{transaction.type}</span>
                        </div>
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                          transaction.amount > 0 ? "text-blue-600" : "text-red-600"
                        }`}
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount.toLocaleString()}원
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                      해당 기간에 거래내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 모바일 뷰 */}
          <div className="md:hidden">
            {paginatedTransactions.length > 0 ? (
              paginatedTransactions.map((transaction) => (
                <div key={transaction.id} className="p-4 border-b">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center">
                      {renderTypeIcon(transaction.type)}
                      <span className="ml-2 font-medium">{transaction.type}</span>
                    </div>
                    <span className={`font-medium ${transaction.amount > 0 ? "text-blue-600" : "text-red-600"}`}>
                      {transaction.amount > 0 ? "+" : ""}
                      {transaction.amount.toLocaleString()}원
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 mb-1">{transaction.description}</p>
                  <p className="text-xs text-gray-500">{new Date(transaction.date).toLocaleDateString("ko-KR")}</p>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-gray-500">해당 기간에 거래내역이 없습니다.</div>
            )}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  이전
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-center">
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">이전</span>
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>

                    {Array.from({ length: totalPages }).map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentPage(index + 1)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === index + 1
                            ? "z-10 bg-[#0061FF] border-[#0061FF] text-white"
                            : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {index + 1}
                      </button>
                    ))}

                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">다음</span>
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        balance={totalBalance}
      />
    </div>
  )
} 