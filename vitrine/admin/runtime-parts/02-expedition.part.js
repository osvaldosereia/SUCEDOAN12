  const {renderExpedition,renderDriver,returnOrderToExpedition,actualPaymentText}=window.DonaAntoniaAdminDelivery.create({
    api,
    orders:{get:()=>state.orders,set:rows=>{state.orders=rows},fiscal:()=>state.fiscalByOrder,loadFiscal:loadFiscalForOrders},
    detail:{get:()=>state.currentOrder,set:value=>{state.currentOrder=value},loadFiscal:loadCurrentOrderFiscal,paint:paintOrderDetail,refreshList:loadOrders,open:openOrder,openDanfe:openDanfeForOrder},
    navigation:{currentTab:()=>state.tab,stockIncident:()=>{state.balanceMode='incident';setTab('balance')},today:renderToday},
    ui:{query:$,document,window,confirm,prompt,toast,currentOperator,requireOperator},
    formatters:{esc,money,dateTime,normalize,formatPhone,errorMessage},
    orderView:{orderDisplayCode,relativeAge,statusPill,whatsappHref,mapsHrefFromAddress,orderSearchMatch,deliveredToday}
  });
