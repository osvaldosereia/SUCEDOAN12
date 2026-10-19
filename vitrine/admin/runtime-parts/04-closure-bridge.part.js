  const {renderClosure}=window.DonaAntoniaAdminClosure.create({
    api,
    orders:{get:()=>state.orders,fiscal:()=>state.fiscalByOrder,mergeFiscal:rows=>{state.fiscalByOrder={...state.fiscalByOrder,...rows}},clearFiscal:()=>{state.fiscalByOrder={}},loadFiscal:loadFiscalForOrders},
    navigation:{currentTab:()=>state.tab},
    ui:{query:$,document,CSS,confirm,toast},formatters:{esc,money,dateTime,errorMessage},
    orderView:{orderDisplayCode,actualPaymentText,fiscalBlockReasonLabel},openOrder
  });
