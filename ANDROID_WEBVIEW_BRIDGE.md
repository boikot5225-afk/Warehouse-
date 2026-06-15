# Android WebView Bridge v39

PWA вызывает Android через объект `LenferAndroidWms`.

Методы:

```js
LenferAndroidWms.lookupWmsByCode(requestId, query)
LenferAndroidWms.lookupWmsByProductId(requestId, productId)
LenferAndroidWms.lookupWmsByCellId(requestId, cellId, cellAddress)
```

Ответ возвращается вызовом JS-функции:

```js
window.lenferWmsNativeResolve(requestId, payloadJson)
window.lenferWmsNativeReject(requestId, message)
```

`lookupWmsByCode` сам определяет режим:

- УТ: `PRODUCT_NOMENCLATURE_CODE`;
- название/ШК: `PRODUCT_NAME`;
- ячейка: `by-address-search`.


## v40 WMS changes
Добавлен режим «Изменение остатка»: /stocks/changes/search по productId/cellId.
