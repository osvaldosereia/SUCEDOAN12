alter table public.basket_lot_images drop constraint basket_lot_images_byte_size_check;
alter table public.basket_lot_images add constraint basket_lot_images_byte_size_check check (byte_size between 1 and 150000);
alter table public.basket_lot_images drop constraint basket_lot_images_width_check;
alter table public.basket_lot_images add constraint basket_lot_images_width_check check (width in (512,640,768,1024));