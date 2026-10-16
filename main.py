from fastapi import FastAPI,Depends
from models import Product
from database import session,engine
import database_models
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

database_models.Base.metadata.create_all(bind=engine) #creates table if it doesnt exist in database

@app.get("/")
def greet():
    return "Welcome to telusko products"

products=[Product(id=1,name="Phone",description="Smart Phone",price=500,quantity=10),
Product(id=2,name=" Charger",description="Fast Charger",price=1000,quantity=20),
Product(id=4,name="HeadPhone",description="Wireless Headphones",price=1500,quantity=30),
Product(id=6,name="Laptop",description="Gaming Laptop",price=70000,quantity=5),
Product(id=9,name="Mobile",description="Smart Mobile",price=70000,quantity=5)]

def get_db():
    db=session()
    try:
        yield db
    finally:
        db.close()
def init_db():#adding all products into database
    db = session()
    for product in products:
        # Check if a product with this ID already exists in the database
        existing_product = db.query(database_models.Product).filter_by(id=product.id).first()
        if not existing_product:
            db.add(database_models.Product(**product.model_dump()))
    db.commit()
    db.close()
init_db()
@app.get("/products")
def get_all_products(db:Session=Depends(get_db)):
    db_products=db.query(database_models.Product).all()
    return db_products

@app.get("/products/{id}") #dynamic path
def get_product_by_id(id:int,db:Session=Depends(get_db)): #wvr name u gonna use in endpoint {} use the same name here
    db_product=db.query(database_models.Product).filter(database_models.Product.id==id).first()
    if db_product:
        return db_product
    return "Product not found"

@app.post("/products") #Add products
def add_product(product:Product,db:Session=Depends(get_db)):
    db.add(database_models.Product(**product.model_dump()))
    db.commit()
    return product

@app.put("/products/{id}")
def update_product(id:int,product:Product,db:Session=Depends(get_db)):
    db_product=db.query(database_models.Product).filter(database_models.Product.id==id).first()
    if db_product:
        db_product.name=product.name
        db_product.description=product.description
        db_product.price=product.price
        db_product.quantity=product.quantity
        db.commit()
        return "Product updated successfully" 
    else:
        return "Product not found"

@app.delete("/products/{id}")
def delete_product(id:int,db:Session=Depends(get_db)):
    db_product=db.query(database_models.Product).filter(database_models.Product.id==id).first()
    if db_product:
        db.delete(db_product)
        db.commit()
        return "Product deleted successfully" 
    else:
        return "product not found"            
