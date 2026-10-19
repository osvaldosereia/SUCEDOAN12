  const manualSaleController=window.DonaAntoniaAdminManualSale.create({
    sale:{get:()=>state.manualSale,set:value=>{state.manualSale=value}},api,customerApi,storefrontApi,
    orders:{render:renderOrders,open:openOrder,selectNewFilter:()=>{state.orderFilter='new'}},ui:{query:$,document,toast,errorMessage,currentOperator,isManualSaleEditor:()=>Boolean($('#editor')?.open&&$('#editorTitle')?.textContent==='Nova venda WhatsApp')},
    formatters:{esc,money,formatPhone,formatCpf,fmtQty,normalize}
  });
  const {manualSaleTotalCents,manualSaleFormValue,manualSaleFillCustomer,paintManualSaleCart,searchManualCustomers,searchManualItems,openManualBasketConfig,addConfiguredManualBasket,openManualSale,createManualSale}=manualSaleController;

  const {orderCustomerDataPendingReasons,isOrderCustomerDataPending:orderCustomerDataPending}=window.DonaAntoniaAdminCustomerReadiness.create(normalize);
  const orderCardModel=window.DonaAntoniaAdminOrderCardModel.create({
    normalize,escapeHtml:esc,
    customerReadiness:{isPending:orderCustomerDataPending,reasons:orderCustomerDataPendingReasons},
    cachedFiscalForOrder:o=>state.fiscalByOrder[o?.id]||null,
    detailFiscalForOrder:o=>orderSession.detail?.order?.id===o?.id?orderSession.fiscal:null
  });
  const {separators:ORDER_SEPARATORS,separatorLabel,orderSeparationSummary,orderV3SearchMatch,orderSeparationCompletedV4,orderV3Milestones,orderFiscalTagV4,orderV3Tags,orderCardOperationalTags}=orderCardModel;
