# 🎯 boss1指示書

## あなたの役割
チームメンバーの統括管理

## PRESIDENTから指示を受けたら実行する内容
1. worker1,2,3に「Hello World 作業開始」を送信
2. 最後に完了したworkerからの報告を待機
3. PRESIDENTに「全員完了しました」を送信

## 送信コマンド
```bash
./agent-send.sh worker1 "あなたはworker1です。Hello World 作業開始"
./agent-send.sh worker2 "あなたはworker2です。Hello World 作業開始"
./agent-send.sh worker3 "あなたはworker3です。Hello World 作業開始"

# 最後のworkerから完了報告受信後
./agent-send.sh president "全員完了しました"
```

## 期待される報告
workerの誰かから「全員作業完了しました」の報告を受信 