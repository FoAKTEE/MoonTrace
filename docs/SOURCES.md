# 参考与实现边界

核对日期：2026-10-05。下列资料是规则背景与签名格式来源，不代表所有线下规则统一。应用内部机制以源码、可编辑桌规和README为准。

- 狼人杀官方（网易）萌新攻略目录，包含守卫、12人标准场、白狼王场及狼王守卫场：
  https://langrensha.com/news/strategy/mengxin/
- 黑狼王规则差异辅助核对（独立站，不将其当成所有平台统一规则）：
  https://www.langrensha.net/strategy/blackwolf.html
- Android Open Source Project — APK Signature Scheme v2 格式、内容摘要和验证流程：
  https://source.android.com/docs/security/features/apksigning/v2
- Android Developers — apksigner，签名后不可修改受保护内容，zipalign在签名前执行：
  https://developer.android.com/tools/apksigner
- Poincaré圆盘几何：原v2所列参考继续保留在网页“数字怎么来的”中。

本版不声称实现完整狼人杀裁判规则。角色目录是记账模板；黑狼王、自救、同守同救、殉情、技能封锁、交换、反伤和第三方勝利都需按本桌规则处理。应用只对明确列出的少数选项给出冲突提醒，不自动判死、不自动翻牌、不自动判断胜负。

APK检查使用自带Python解析器和cryptography完成，包括对原输入APK签名的校验。未在当前环境使用Android SDK apksigner，也没有Android设备安装测试。建议在正式分发前再用SDK apksigner验证并进行真机验收。
