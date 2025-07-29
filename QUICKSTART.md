# 🚀 Claude Code Communication - クイックスタート

Claude Code Communication は、複数の AI エージェントを使って協調的にタスクを実行するシステムです。

## 📋 前提条件

- Node.js 18+ がインストールされている
- Claude Code CLI がインストールされている (`claude` コマンドが使用可能)
- tmux がインストールされている
- 基本的なターミナル操作の知識

## ⚡ 5 分で始める

### 1. 依存関係のインストール

```bash
npm install
```

### 2. データベースのセットアップ

```bash
# Prisma の初期化
npx prisma generate
npx prisma migrate dev
```

### 3. システムの起動

```bash
# 開発サーバーを起動（フロントエンド + バックエンド）
npm run dev
```

これで以下のサービスが起動します：
- 🌐 WebUI: http://localhost:3000 (または自動的に別ポートが割り当てられます)
- 🔧 バックエンド API: http://localhost:3001

### 4. AI エージェントの起動（初回のみ）

**初回起動時のみ**、別のターミナルで以下を実行：

```bash
# tmux セッションを作成してエージェントを一括起動
./launch-agents.sh
```

これにより以下のエージェントが起動します：
- 👑 **President** - プロジェクト統括責任者
- 🎯 **Boss1** - チームリーダー
- 👷 **Worker1-3** - 実行担当者

**2 回目以降は自動復旧機能により不要**：
- システムが自動的にエージェントの状態を監視
- 問題検出時に自動復旧を実行
- WebUI の手動復旧ボタンでも復旧可能

## 🎮 基本的な使い方

### WebUI でのタスク実行

1. **WebUI を開く**: ブラウザで http://localhost:3000 にアクセス
2. **タスクを投入**: Quick Actions フォームからタスクタイトルと詳細を入力
3. **進捗を確認**: Task Pipeline でリアルタイムの進捗を監視
4. **エージェント状態を確認**: Agent Status でチームの稼働状況を確認
5. **成果物をダウンロード**: 完了タスクのプロジェクトファイルを ZIP で取得
6. **パフォーマンス監視**: KPI メトリクスでシステムの健康状態を確認

### ターミナルでの直接操作

```bash
# President に直接メッセージを送信
./agent-send.sh president "Web サイトを作成してください"

# Worker1 に作業指示
./agent-send.sh worker1 "React コンポーネントを作成してください"
```

## 📊 システム監視

### システムヘルス

WebUI の右上で以下を確認できます：
- **tmux**: tmux セッションの状態
- **Claude**: Claude エージェントの稼働状況（5/5 が理想）
- **Monitor**: タスク完了監視の状態

### Task Pipeline の拡張表示

WebUI では Task Pipeline が横幅を拡張して表示され、より多くのタスク情報を一覧できます。
- **ワイドレイアウト**: 画面幅を最大活用したタスク表示
- **詳細情報**: 各タスクの進捗とステータスを詳細表示
- **フィルタリング**: 検索・ステータス別・プロジェクト別の絞り込み
- **操作性向上**: より多くのタスクを同時に管理可能

### KPI メトリクス

左上パネルで以下の指標を監視できます：
- **Total Tasks**: 全タスク数と成功/失敗統計
- **In Progress**: 現在実行中のタスク数
- **Completion Rate**: タスク完了率とトレンド
- **Active Agents**: 稼働中エージェント数

## 🔧 トラブルシューティング

### よくある問題

#### エージェントが起動しない
```bash
# tmux セッションを確認
tmux list-sessions

# 手動でセッション作成
tmux new-session -d -s president
tmux new-session -d -s multiagent
```

#### WebUI が表示されない
```bash
# プロセス確認
lsof -i :3000
lsof -i :3001

# ポート変更
PORT=3002 npm run dev
```

#### データベースエラー
```bash
# データベースリセット
rm -f data/database.db
npx prisma migrate dev --name init
```

### ログの確認

```bash
# バックエンドログ
tail -f logs/*.log

# エージェント送信ログ
tail -f logs/send_log.txt
```

## 📁 プロジェクト構造

```
Claude-Code-Communication/
├── src/
│   ├── backend/           # バックエンド API
│   │   ├── server.ts     # メインサーバー
│   │   ├── database.ts   # データベース層
│   │   └── services/     # 機能別サービス
│   ├── frontend/         # フロントエンド UI
│   │   ├── App.tsx       # メインアプリ
│   │   ├── components/   # UI コンポーネント
│   │   └── hooks/        # React フック
│   └── types/           # TypeScript 型定義
├── instructions/        # エージェント指示書
├── data/               # データベースファイル
└── logs/               # ログファイル
```

## 🎯 使用例

### Web サイト作成タスク

1. **タスク投入**:
   ```
   タイトル: 企業ホームページ作成
   詳細: レスポンシブな企業ホームページを作成してください。
   ```

2. **自動処理フロー**:
   - President がタスクを受信
   - Boss1 がチームに作業分担
   - Worker1-3 が並行して開発実行
   - 完了時に自動的にステータス更新
   
3. **成果物の取得**:
   - Task Pipeline で完了タスクを確認
   - ダウンロードボタン（⬇️）をクリック
   - プロジェクトファイルを ZIP 形式でダウンロード

### API 開発タスク

1. **タスク投入**:
   ```
   タイトル: REST API 開発
   詳細: ユーザー管理の REST API を作成してください。
   ```

2. **期待される成果物**:
   - `workspace/rest-api-development/` 配下に成果物
   - API 仕様書
   - テストコード
   - デプロイ用設定

## 🔗 関連リンク

- [詳細ドキュメント](docs/WEBUI_USAGE.md) - Web UI の完全な使用方法
- [プロジェクトダウンロードガイド](docs/PROJECT_DOWNLOAD_GUIDE.md) - 成果物ダウンロード機能の詳細
- [エージェント指示書](instructions/) - AI エージェントの役割定義
- [プロジェクト管理](CLAUDE.md) - エージェント通信システムの概要

## ❓ ヘルプ

問題が発生した場合：

1. **ログを確認**: `tail -f logs/send_log.txt`
2. **システム状態確認**: WebUI の System Health
3. **手動復旧**: WebUI の手動復旧ボタン

---

**🎉 これで Claude Code Communication を使い始める準備が整いました！**

WebUI でタスクを投入して、AI エージェントチームの協調作業を体験してください。