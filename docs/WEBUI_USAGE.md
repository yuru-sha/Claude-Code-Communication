# Claude Code Communication - Web UI 使用方法

## 概要

Claude Code Communication の Web UI は、複数の Claude Code エージェントが協力してタスクを実行する様子をリアルタイムで監視・管理できるダッシュボードです。

## 機能

### ✨ 主要機能
- **インテリジェントタスクフォーム**: Quick Actions フォームからタスクを迅速送信
- **FIFO タスクパイプライン**: 先入先出でタスクを順次処理、進捗追跡機能付き
- **リアルタイム監視**: エージェントの状態とタスク進捗をリアルタイム表示
- **タブ付きターミナル**: 各エージェントのターミナル出力を統合表示
- **データベース永続化**: Prisma + SQLite による完全なデータ永続化
- **システムヘルス監視**: tmux セッション、Claude エージェント、監視システムの状態を一元管理
- **自動復旧機能**: システム障害時の自動復旧とマニュアル復旧オプション
- **タスク完了自動検知**: AI による作業完了の自動検出と通知
- **エラー追跡**: 失敗履歴、再試行カウント、エラー詳細の管理
- **KPI ダッシュボード**: タスク完了率、エージェント稼働率、パフォーマンス指標

### 🎯 エージェント構成
- **President**: プロジェクト統括責任者
- **Boss1**: チームリーダー
- **Worker1-3**: 実行担当者

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. データベースのセットアップ
```bash
# Prisma の初期化とマイグレーション実行
npx prisma generate
npx prisma migrate dev
```

### 3. tmux セッションの準備
```bash
# エージェントを一括起動
./launch-agents.sh
```

### 4. Web UI の起動
```bash
# 開発モード（フロントエンド + バックエンド同時起動）
npm run dev

# または個別起動
npm run dev:server  # バックエンドのみ（ポート 3001）
npm run dev:frontend  # フロントエンドのみ（ポート 3000）
```

## 使用方法

### 🚀 基本的な流れ

1. **Web UI にアクセス**: http://localhost:3000
2. **システム状態確認**: ヘッダーでシステムヘルス（tmux、Claude、Monitor）を確認
3. **タスクを入力**: Quick Actions フォームにタスクタイトルと詳細を記入
4. **送信**: "Submit Task"ボタンをクリック
5. **監視**: Task Pipeline でリアルタイムの進捗を確認
6. **結果確認**: 完了通知と成果物を確認

### 📋 ダッシュボードの詳細機能

#### System Health （ヘッダー右上）
- **tmux**: tmux セッションの状態インジケーター
- **Claude**: Claude エージェントの稼働状況（5/5 が理想）
- **Monitor**: タスク完了監視システムの状態
- **手動復旧ボタン**: システム障害時の緊急復旧
- **監視切り替えボタン**: タスク完了監視の有効/無効切り替え

#### KPI Metrics （左上パネル）
- **Total Tasks**: 全タスク数と成功/失敗統計
- **In Progress**: 現在実行中のタスク数とプログレスバー
- **Completion Rate**: タスク完了率とトレンドチャート
- **Active Agents**: 稼働中エージェント数とステータスドット

#### Task Pipeline （左下パネル）
- **フィルター機能**: 検索、ステータス、プロジェクト別のタスク絞り込み
- **統計チップ**: Pending、In Progress、Done、Failed の件数表示（2 列 2 行レイアウト）
  - クリックでステータス別フィルタリング可能
- **タスクカード**: 各タスクの詳細情報と進捗バー
- **失敗情報**: エラー理由、再試行履歴、エラー履歴の詳細表示
- **タスク操作**: 再実行ボタン、削除ボタン（workspace/ディレクトリも含む完全削除）
- **プロジェクトダウンロード**: 完了タスクのプロジェクトファイルを ZIP 形式でダウンロード

#### Agent Status （右上パネル）
- **リアルタイムステータス**: 各エージェントの現在状態
- **作業内容**: 現在担当しているタスク名
- **効率指標**: エージェントの作業効率パーセンテージ
- **ステータス色分け**: 
  - **🟢 緑（working）**: 作業中（積極的に動作）
  - **🟡 オレンジ（idle）**: 待機中（起動済みだが作業なし）
  - **🔴 赤（offline）**: オフライン（未起動または障害）

#### Tabbed Terminals （右下パネル）
- **タブ切り替え**: President、Boss1、Worker1-3 のターミナル
- **ステータス表示**: 各タブに色付きドットでエージェント状態を表示
- **リアルタイム出力**: 各エージェントのターミナル出力をリアルタイム表示
- **自動スクロール**: 最新の出力を自動で表示

### 💡 タスク例

**例 1: フルスタック Web アプリ**
```
タイトル: TODO リストアプリの作成
詳細: React と TypeScript を使った TODO リストアプリを作成してください。
機能要件: タスクの追加、削除、完了、優先度設定、カテゴリ分類
技術要件: Prisma + SQLite、Express.js API、レスポンシブデザイン
```

**例 2: マイクロサービス API**
```
タイトル: ユーザー管理マイクロサービス
詳細: Express.js と TypeScript でユーザー管理 API を作成してください。
機能要件: JWT 認証、CRUD 操作、ロールベースアクセス制御
技術要件: OpenAPI 仕様書、ユニットテスト、Docker 化
```

**例 3: データ分析システム**
```
タイトル:売上分析ダッシュボード
詳細: CSV データを読み込んで売上分析を行うシステムを作成してください。
機能要件: データ取り込み、集計処理、グラフ表示、レポート出力
技術要件: Node.js、Chart.js、PDF 生成、バッチ処理
```

**例 4: DevOps 環境構築**
```
タイトル: CI/CD パイプライン構築
詳細: GitHub Actions を使った自動化パイプラインを構築してください。
機能要件: テスト自動実行、ビルド、デプロイ、品質チェック
技術要件: Docker、AWS/GCP、セキュリティスキャン、通知機能
```

## 技術仕様

### 🔧 技術スタック
- **フロントエンド**: React 19 + TypeScript + Vite + TailwindCSS 4 + Lucide React
- **バックエンド**: Node.js + Express 5 + Socket.IO + TypeScript
- **データベース**: Prisma ORM + SQLite
- **UI ライブラリ**: Lucide React（アイコン）、カスタム CSS（レスポンシブデザイン）
- **プロセス管理**: tmux（セッション管理）
- **リアルタイム通信**: Socket.IO（WebSocket）
- **開発ツール**: ts-node-dev（ホットリロード）、concurrently（並行プロセス）

### 📁 プロジェクト構造
```
Claude-Code-Communication/
├── src/
│   ├── backend/               # バックエンド API
│   │   ├── server.ts         # メインサーバー
│   │   ├── database.ts       # データベース接続
│   │   └── services/         # 機能別サービス
│   │       ├── healthCheck.ts
│   │       ├── autoRecovery.ts
│   │       ├── taskManager.ts
│   │       └── taskCompletion.ts
│   ├── frontend/             # フロントエンド UI
│   │   ├── App.tsx           # メインアプリ
│   │   ├── components/       # UI コンポーネント
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TaskPipeline.tsx
│   │   │   ├── DashboardHeader.tsx
│   │   │   ├── KPIMetrics.tsx
│   │   │   ├── RequestForm.tsx
│   │   │   ├── TabbedTerminals.tsx
│   │   │   └── Terminal.tsx
│   │   ├── hooks/            # React フック
│   │   │   └── useSocket.ts
│   │   └── styles/           # スタイルファイル
│   │       ├── dashboard.css
│   │       └── globals.css
│   ├── types/                # TypeScript 型定義
│   │   └── index.ts
│   └── generated/            # 自動生成ファイル
│       └── prisma/          # Prisma クライアント
├── prisma/                   # データベース
│   ├── schema.prisma        # スキーマ定義
│   └── migrations/          # マイグレーションファイル
├── data/                     # データベースファイル
│   └── database.db          # SQLite データベース
├── logs/                     # ログファイル
└── instructions/            # エージェント指示書
```

### 🔌 Socket.IO イベント

#### クライアント → サーバー
- `request-task`: 新しいタスクの送信
- `task-completed`: タスク完了通知
- `delete-task`: タスク削除（workspace/ディレクトリも含む）
- `request-manual-recovery`: 手動復旧要求
- `toggle-task-completion-monitoring`: タスク完了監視の切り替え
- `retry-task`: 失敗タスクの再実行
- `mark-task-failed`: タスクを失敗状態にマーク

#### サーバー → クライアント
- `task-queued`: タスクがキューに追加
- `task-assigned`: タスクがエージェントに割り当て
- `task-completed`: タスク完了
- `task-failed`: タスク失敗
- `task-deleted`: タスク削除完了（プロジェクトディレクトリ削除含む）
- `task-queue-updated`: キュー状態の更新
- `agent-status-updated`: エージェント状態更新
- `system-health-updated`: システムヘルス更新
- `auto-recovery-status`: 自動復旧状況
- `task-completion-detected`: タスク完了自動検知

## 運用

### 🔄 日常的な使用
1. **起動**: `npm run dev` で Web UI とサーバーを同時起動
2. **エージェント起動**: `./launch-agents.sh` で AI エージェントを起動
3. **システム確認**: ダッシュボードヘッダーでシステムヘルスを確認
4. **タスク投入**: Quick Actions フォームからタスクを送信
5. **進捗監視**: Task Pipeline と Agent Status で作業状況を確認
6. **結果確認**: 完了通知で成果物を確認

### 🛠️ トラブルシューティング

**システムヘルスが degraded/critical の場合**
```bash
# システム状態確認
tmux list-sessions
ps aux | grep claude

# 自動復旧実行（Web UI の手動復旧ボタン使用推奨）
./launch-agents.sh
```

**エージェントが offline の場合**
```bash
# 全 tmux セッション再作成（推奨）
tmux kill-session -t president
tmux kill-session -t multiagent
./launch-agents.sh
```

**tmux セッション部分障害の場合**
```bash
# president セッションのみ落ちている場合
if ! tmux has-session -t president 2>/dev/null; then
    echo "President セッション障害検出 - 全セッション再起動"
    tmux kill-server
    ./launch-agents.sh
fi

# multiagent セッションのみ落ちている場合
if ! tmux has-session -t multiagent 2>/dev/null; then
    echo "Multiagent セッション障害検出 - 全セッション再起動"
    tmux kill-server
    ./launch-agents.sh
fi
```

**Claude Code プロセス部分障害の場合**
```bash
# 特定エージェントの Claude Code が落ちている場合

# President のみ障害
tmux send-keys -t president "claude --session-name=president" Enter

# Boss1 のみ障害
tmux send-keys -t multiagent:0 "claude --session-name=boss1" Enter

# Worker1 のみ障害
tmux send-keys -t multiagent:1 "claude --session-name=worker1" Enter

# Worker2 のみ障害
tmux send-keys -t multiagent:2 "claude --session-name=worker2" Enter

# Worker3 のみ障害
tmux send-keys -t multiagent:3 "claude --session-name=worker3" Enter
```

**Web UI 接続エラーの場合**
- フロントエンド: http://localhost:3000 にアクセス可能か確認
- バックエンド: http://localhost:3001 が起動しているか確認
- Socket.IO 接続状態をブラウザの開発者ツールで確認

**タスクが処理されない場合**
- Agent Status で President が working 状態か確認
- Prisma データベース接続エラーをサーバーログで確認
- Task Pipeline でタスクが正常にキューイングされているか確認

**データベースエラーの場合**
```bash
# データベースリセット
rm -f data/database.db
npx prisma migrate dev --name init
```

### 📊 監視ポイント
- **System Health**: 全インジケーターが緑色（healthy）であること
- **KPI Metrics**: タスク完了率、エージェント稼働率
- **Task Pipeline**: 失敗タスクの発生状況とエラー内容
- **Agent Status**: 全エージェントが適切に稼働していること
- **Tabbed Terminals**: エラーメッセージや異常な出力の監視

## 拡張機能

### 🔮 今後の機能予定
- **タスク管理強化**: 優先度設定、期限管理、依存関係定義
- **エージェント拡張**: 専門スキル指定、動的エージェント追加
- **分析機能**: パフォーマンス分析、作業効率レポート、コスト分析
- **コラボレーション**: チャット機能、リアルタイム共同編集
- **外部連携**: GitHub/GitLab 連携、Slack/Discord 通知
- **セキュリティ**: ユーザー認証、ロールベース権限管理
- **スケーラビリティ**: マルチテナント対応、クラウドデプロイ

### 🔧 カスタマイズ方法

#### 型定義の拡張
```typescript
// src/types/index.ts
export interface CustomTask extends Task {
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedTime: number;
  dependencies: string[];
}
```

#### サーバー機能の追加
```typescript
// src/backend/services/customService.ts
export class CustomService {
  static async processCustomTask(task: CustomTask) {
    // カスタムロジック実装
  }
}
```

#### UI コンポーネントの追加
```typescript
// src/frontend/components/CustomComponent.tsx
import { useState } from 'react';
import { Task } from '../../types';

export const CustomComponent = ({ tasks }: { tasks: Task[] }) => {
  // カスタム UI 実装
};
```

#### データベーススキーマの拡張
```prisma
// prisma/schema.prisma
model CustomTable {
  id        String   @id @default(cuid())
  name      String
  value     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## パフォーマンス最適化

### ⚡ システム最適化のヒント

#### フロントエンド最適化
- **React.memo**: 不要な再レンダリングを防止
- **useMemo/useCallback**: 重い計算の結果をキャッシュ
- **Socket.IO 最適化**: イベントリスナーの適切な登録/解除

#### バックエンド最適化
- **データベース最適化**: インデックス作成、クエリ最適化
- **Socket.IO スケーリング**: Redis アダプター使用
- **並行処理**: 複数タスクの並列実行

#### 運用最適化
- **tmux セッション管理**: 適切なセッション数の維持
- **ログローテーション**: ログファイルサイズの管理
- **リソース監視**: CPU/メモリ使用量の監視

## セキュリティ考慮事項

### 🔒 セキュリティベストプラクティス
- **入力検証**: 全ユーザー入力の適切な検証・サニタイズ
- **Socket.IO セキュリティ**: 適切な CORS 設定とレート制限
- **ファイルアクセス制限**: 実行ファイルの安全な管理
- **ログセキュリティ**: 機密情報のログ出力防止
- **ネットワークセキュリティ**: 必要最小限のポート開放

## ライセンス

ISC License

## サポート

### 📞 サポートチャネル
- **GitHub Issues**: バグ報告・機能要望
- **GitHub Discussions**: 質問・相談
- **Documentation**: 詳細なドキュメントは `docs/` ディレクトリを参照

### 🔗 関連リンク
- [QUICKSTART.md](../QUICKSTART.md) - 5 分で始めるクイックスタート
- [CLAUDE.md](../CLAUDE.md) - プロジェクト概要とエージェント構成
- [instructions/](../instructions/) - エージェント指示書

---

**🚀 AI Agent Orchestration Platform - Claude Code Communication**

*複数の AI エージェントが協調的に働く、次世代の開発プラットフォームを体験してください！*