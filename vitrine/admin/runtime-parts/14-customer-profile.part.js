  const {renderCustomers,openCustomerEditor}=window.DonaAntoniaAdminCustomers.create({
    customerApi,customers:{get:()=>state.customers,set:rows=>{state.customers=rows}},
    navigation:{currentTab:()=>state.tab},ui:{query:$,document,FormData,confirm,toast},
    formatters:{esc,money,fmtQty,dateTime,formatPhone,formatCpf,errorMessage},statusPill,openOrder
  });
