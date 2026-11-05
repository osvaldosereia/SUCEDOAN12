UPDATE public.order_separation_whatsapp_settings_v1
SET draft_body = E'Olá! O pedido {{1}} é nossa próxima entrega. A previsão é chegar em até {{2}} minutos.\n\nSeu entregador é {{3}}, WhatsApp {{4}}.\n\nValor do pedido: {{5}}.\nForma de pagamento: {{6}}.\n\nSe precisar, fale diretamente com o entregador pelo WhatsApp informado.'
WHERE notification_kind = 'driver_next_stop'
  AND draft_body = E'Olá! O pedido {{1}} é nossa próxima entrega. A previsão é chegar em até {{2}} minutos.\n\nSeu entregador é {{3}}, WhatsApp {{4}}.\n\nValor do pedido: {{5}}.\nForma de pagamento: {{6}}.';