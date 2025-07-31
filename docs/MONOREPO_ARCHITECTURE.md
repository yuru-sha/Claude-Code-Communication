# モノレポアーキテクチャガイド

## 概要

Claude Code Communication は、npm workspaces を使用したモノレポ構成で開発されています。このドキュメントでは、モノレポの構造と開発フローについて説明します。

## ディレクトリ構造

```
Claude-Code-Communication/
├── apps/                          # アプリケーション
│   ├── client/                    # React フロントエンド
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── server/                    # Express バックエンド
│       ├── src/
│       ├── prisma/
│       ├── package.json
│       └── tsconfig.json
├── packages/                      # 共有パッケージ
│   ├── types/                     # TypeScript 型定義
│   │   ├── src/
│   │   └── package.json
│   ├── utils/                     # ユーティリティ関数
│   │   ├── src/
│   │   └── package.json
│   └── ui/                        # 共通 UI コンポーネント
│       ├── src/
│       └── package.json
├── package.json                   # ルートパッケージ
├── tsconfig.json                  # TypeScript 設定
└── README.md
```

## パッケージ管理

### ワークスペース設定

`package.json` でワークスペースを定義：

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

### 依存関係の管理

#### ルートレベルでの依存関係インストール
```bash
# 全ワークスペースの依存関係をインストール
npm install

# 全ワークスペースをビルド
npm run build
```

#### 特定のワークスペースでの作業
```bash
# 特定のワークスペースでコマンド実行
npm run dev --workspace=@claude-communication/client
npm run build --workspace=@claude-communication/server

# 特定のワークスペースに依存関係追加
npm install lodash --workspace=@claude-communication/utils
```

### 共有パッケージの使用

#### 型定義の共有
```typescript
// apps/client/src/components/TaskList.tsx
import { Task, TaskStatus } from '@claude-communication/types';

// apps/server/src/controllers/TaskController.ts
import { Task, AgentStatus } from '@claude-communication/types';
```

#### ユーティリティ関数の共有
```typescript
// packages/utils/src/dateUtils.ts
export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// apps/client/src/components/TaskItem.tsx
import { formatDate } from '@claude-communication/utils';
```

## TypeScript 設定

### プロジェクト参照

ルート `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@claude-communication/types": ["./packages/types/src"],
      "@claude-communication/utils": ["./packages/utils/src"],
      "@claude-communication/ui": ["./packages/ui/src"]
    }
  },
  "references": [
    { "path": "./apps/client" },
    { "path": "./apps/server" },
    { "path": "./packages/types" },
    { "path": "./packages/utils" },
    { "path": "./packages/ui" }
  ]
}
```

### パッケージ内設定

各パッケージの `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../types" },
    { "path": "../utils" }
  ]
}
```

## 開発フロー

### 開発サーバーの起動

```bash
# フロントエンドとバックエンドを同時起動
npm run dev

# 個別起動
npm run dev:client  # localhost:5173
npm run dev:server  # localhost:3001
```

### ビルドプロセス

```bash
# 段階的ビルド（推奨）
npm run build:packages  # 共有パッケージを先に
npm run build:apps      # アプリケーションを後に

# 一括ビルド
npm run build
```

### テスト実行

```bash
# 全ワークスペースのテスト実行
npm test

# 特定のワークスペースのテスト
npm test --workspace=@claude-communication/server
```

## パッケージバージョン管理

### 内部依存関係

`package.json` での内部パッケージ参照：
```json
{
  "dependencies": {
    "@claude-communication/types": "*",
    "@claude-communication/utils": "*"
  }
}
```

### バージョンアップデート

```bash
# 全パッケージのバージョンを同期
npm version patch --workspaces
npm version minor --workspaces
npm version major --workspaces
```

## ベストプラクティス

### 1. 共通コードの配置

- **types/**: TypeScript 型定義、インターフェース
- **utils/**: ピュアな関数、ヘルパー関数
- **ui/**: 再利用可能な React コンポーネント

### 2. 依存関係の管理

- 共通の依存関係はルートに配置
- パッケージ固有の依存関係は各パッケージに配置
- 内部パッケージは `"*"` でバージョン指定

### 3. TypeScript 設定

- プロジェクト参照で型チェックの高速化
- パスマッピングで相対パスを回避
- 各パッケージで `composite: true` を設定

### 4. ビルド順序

1. 共有パッケージ（types, utils, ui）
2. アプリケーション（client, server）

### 5. 開発効率の向上

- ホットリロード対応
- 型安全性の確保
- コードの重複排除
- 統一された Lint/Format 設定

## トラブルシューティング

### よくある問題

#### 型解決エラー
```bash
# TypeScript プロジェクト参照の再構築
npx tsc --build --force
```

#### モジュール解決エラー
```bash
# node_modules を削除して再インストール
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install
```

#### ビルドエラー
```bash
# 段階的ビルドで依存関係を確認
npm run build:packages
npm run build:apps
```

## まとめ

モノレポ構成により以下のメリットを実現：

- **型安全性**: 共有型定義による一貫性
- **コード再利用**: 共通ロジックの効率的な共有
- **開発効率**: 統一された開発環境とツールチェーン
- **保守性**: 単一リポジトリでの一括管理

この構成により、フロントエンドとバックエンドの密結合な開発が可能になり、開発効率と品質の向上を実現しています。