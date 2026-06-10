using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

[System.Serializable]
public class ToothIndex
{
	public int major_index;
	public int minor_index;
	public int tooth_type;
	public Tooth_Presence tooth_presence;
	public int mesh_presence;
	public int array_index;
}

[System.Serializable]
public class ToothRest
{
	public Tooth_Type tooth_type;
	public Anterior_Rest anterior_rest;
	public Anterior_Cingulum_Rest_Type anterior_cingulum_rest_type;
	public Anterior_Incisal_Rest_Type anterior_incisal_rest_type;
	public Posterior_Rest_Type posterior_rest_type;
	public Posterior_Rest_Position posterior_rest_position;
	public bool pr_config1;//f;
	public bool pr_config2;//p_lingual;
	public bool pr_config3;//p_distal;
}

[System.Serializable]
public class ToothRetainer
{
	public Retainer_Type retainer_type;
	public Retainer_Clasp_type retainer_clasp_type;
	public Retainer_Ring_type retainer_ring_type;
	public Retainer_Bar_Type retainer_bar_type;
	public Retainer_Bar_Category retainer_bar_category;
}

[System.Serializable]
public class ToothReciprocating
{
	public Reciprocating_Type reciprocating_type;

}

[System.Serializable]
public class ToothMain
{
	public ToothIndex ti;
	public ToothRest tr;
	public ToothRetainer trt;
	public ToothReciprocating trc;

}


public enum ComponentType
{
	Clasp,
	Ring,
	Bar,
	Recipocating,
	Mesh,
	Null

}


[System.Serializable]
public class ConnectorData
{
	public bool presence;
	public bool isMesh;
	public bool isComponentPresent;

	public bool isDistoComp;
	public bool isMiseolComp;

}

public class GenericTooth : MonoBehaviour//, IPointerClickHandler
{
	[SerializeField]
	public ToothMain ToothData; //why is there muitilple presence variables?

	[SerializeField] //tooth FDI ID
	public int ToothIndex;

	public int ToothArray;

	[SerializeField]
	GameObject ComponentGameObject;

	[SerializeField]
	List<RPD_2DComponent.componentType> AvailableComponent = new List<RPD_2DComponent.componentType>();
	//[SerializeField]
	public List<RPD_2DComponent.componentType> ComponentSetList = new List<RPD_2DComponent.componentType>();


	Transform ClaspCC, RingCC, BarCC, RecipocatingCC, MeshCC;

	[SerializeField]
	public Tooth_Presence presence; //why is there muitilple presence variables?

	[SerializeField]
	RPD_ToothCompToggles toothCompToggles;


	public event System.Action<int, bool> OnPresenceChanged;

	public void Awake()
	{

		foreach (var image in transform.GetChild(0).GetComponentsInChildren<Image>())
		{
			image.alphaHitTestMinimumThreshold = 0.001f;
		}


		ClaspCC = RingCC = BarCC = RecipocatingCC = MeshCC = null;

		AvailableComponent.Clear();

		UpdateTooth();

		//InitDLL();
	}

	private void OnEnable()
	{
		if (Solo2DManager.IsSolo2D)
		{
			return;
		}

		InitDLL();
	}

	/// <summary>
	/// Gets list of components on this tooth
	/// </summary>
	/// <returns>List of components on this tooth</returns>
	public List<RPD_2DComponent.componentType> GetAllSetComponent()
	{
		return ComponentSetList;
	}

	/// <summary>
	/// Checks and sets whether tooth is missing or present
	/// </summary>
	public void InitDLL()
	{
		if (DLLIntegration.instance.CheckToothPressence(ToothIndex) == false)
			SetToothMissing();
		else
			SetTooth();
	}

	/// <summary>
	/// Initializes tooth condition from DLL data
	/// </summary>
	/// <param name="arrayInt">Tooth patch ID</param>
	public void InitToothCondition(int arrayInt)
	{
		SyncConditionFromJaw(arrayInt);
	}


	List<Transform> AddList = new List<Transform>();

	/// <summary>
	/// Adds component
	/// </summary>
	/// <param name="type">Name of component, RPD_2DComponent.componentType</param>
	public void SetComponent(string type)
	{
		RPD_2DComponent.componentType temp = (RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), type);
		SetComponent(temp);
	}

	/// <summary>
	/// Adds reciprocating clasp to tooth
	/// </summary>
	/// <param name="type">Name of reciprocating clasp, RPD_2DComponent.componentType</param>
	public void SetRecipClasp(string type)
	{
		RPD_2DComponent.componentType temp = RPD_2DComponent.componentType.reciprocating_clasp; //(RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), type);

		//check compatibility
		//check compatibility
		ComponentType Type = CheckType(temp);
		//RPD_2DComponent.componentType CompType;

		print("type: " + type);
		print("clasp CC: " + ClaspCC);

		//GameObject recipC;

		if ((ClaspCC != null || BarCC != null) && temp == RPD_2DComponent.componentType.reciprocating_clasp)
		{
			print("trying to place clasp");

			if (RecipocatingCC)
				RemoveDup(RecipocatingCC);

			if (Solo2DManager.IsSolo2D)
			{
				foreach (Transform T in ComponentGameObject.transform)
				{
					//changed the hierachy and the way the name is found
					if ((type.ToString() + "_reciprocating_clasp") == T.name)// type.ToString() == T.name)
					{
						print("placing clasp " + T.name + " || " + type.ToString());
						//recipC = T.Find("reciprocating_clasp").gameObject;
						T.GetComponent<Image>().enabled = true;
						//recipC.GetComponent<PolygonCollider2D>().enabled = true;
						T.transform.GetChild(0).GetComponent<Image>().enabled = true;

						RecipocatingCC = T.transform;  //recipC.transform;
													   //CompType = RPD_2DComponent.componentType.reciprocating_clasp;
					}
				}
			}

			else
			{
				foreach (Transform T in ComponentGameObject.transform)
				{
					//changed the hierachy and the way the name is found
					if (type.ToString() == T.name)// type.ToString() == T.name)
					{
						print("placing clasp " + T.name + " || " + type.ToString());
						//recipC = T.Find("reciprocating_clasp").gameObject;
						T.GetComponent<Image>().enabled = true;
						//recipC.GetComponent<PolygonCollider2D>().enabled = true;
						T.transform.GetChild(0).GetComponent<Image>().enabled = true;

						RecipocatingCC = T.transform;  //recipC.transform;
													   //CompType = RPD_2DComponent.componentType.reciprocating_clasp;
					}
				}
			}

			ComponentSetList.Add(temp);// CompType);
		}
	}

	/// <summary>
	/// Adds component 
	/// </summary>
	/// <param name="type">Component to add</param>
	public void SetComponent(RPD_2DComponent.componentType type)
	{
		if (RPDManager.instance.useNew2DSystem)
		{
			Logger.Log(TypeLog.RPD2D, $"{ToothIndex} {type}");
			ComponentSetList.Add(type);
			return;
		}

		Logger.Log(TypeLog.RPD2D, $"{ToothIndex} {type}");

		//check if setable
		if (ComponentGameObject == null)
			return;// ComponentType.Null;

		if (ComponentSetList.Contains(type)) //dont set if component already existed
			return;// ComponentType.Null;

		//check compatibility
		ComponentType Type = CheckType(type);


		if ((ClaspCC != null || BarCC != null) && type == RPD_2DComponent.componentType.reciprocating_clasp)
		{
			if (RecipocatingCC)
				RemoveDup(RecipocatingCC);

			foreach (Transform T in ComponentGameObject.transform)
			{
				//changed the hierachy and the way the name is found
				if (type.ToString() == T.name)//+ "_reciprocating_clasp") type.ToString() == T.name)
				{
					print("placing clasp");
					//recipC = T.Find("reciprocating_clasp").gameObject;
					T.GetComponent<Image>().enabled = true;
					//recipC.GetComponent<PolygonCollider2D>().enabled = true;
					T.transform.GetChild(0).GetComponent<Image>().enabled = true;

					RecipocatingCC = T.transform;  //recipC.transform;
												   //CompType = RPD_2DComponent.componentType.reciprocating_clasp;
				}
			}
			//foreach (Transform T in ClaspCC.transform)
			//{
			//	//Debug.LogError("Here");

			//	if ( T.name.Contains("_reciprocating_clasp")) //"reciprocating_clasp" == T.name)
			//	{
			//		T.gameObject.SetActive(true);
			//		if (T.GetComponent<Image>())
			//			T.GetComponent<Image>().enabled = true;
			//		//if (T.GetComponent<PolygonCollider2D>())
			//			//T.GetComponent<PolygonCollider2D>().enabled = true;
			//		if (T.childCount > 0)
			//			if (T.GetChild(0).name == "highlightTip")
			//				T.GetChild(0).GetComponent<Image>().enabled = true;
			//	}
			//}


			ComponentSetList.Add(type);
			return;// Type;
		}


		if (Type == ComponentType.Mesh && BarLogic.instance != null && BarLogic.instance.MeshLogicSet == false)
		{
			BarLogic.instance.DefineAndSetMesh(int.Parse(gameObject.transform.parent.name), type);
			return;// Type;
		}

		foreach (Transform T in ComponentGameObject.transform)
		{

			if (type.ToString() == T.name)
			{

				T.gameObject.SetActive(true);
				if (T.GetComponent<Image>())
					T.GetComponent<Image>().enabled = true;
				//if (T.GetComponent<PolygonCollider2D>())
				//T.GetComponent<PolygonCollider2D>().enabled = true;
				if (T.childCount > 0)
					if (T.GetChild(0).name == "highlightTip")
						T.GetChild(0).GetComponent<Image>().enabled = true;


				if (Type == ComponentType.Clasp)
					ClaspCC = T;
				else if (Type == ComponentType.Ring)
					RingCC = T;
				else if (Type == ComponentType.Bar)
					BarCC = T;
				else if (Type == ComponentType.Recipocating) //plate
				{
					if (ClaspCC != null)
						foreach (Transform T1 in ClaspCC.transform)
						{
							if (T1.name.Contains("_reciprocating_clasp")) //"reciprocating_clasp" == T1.name)
							{
								if (T1.GetComponent<Image>())
									T1.GetComponent<Image>().enabled = false;
								//if (T1.GetComponent<PolygonCollider2D>())
								//T1.GetComponent<PolygonCollider2D>().enabled = false;
								if (T1.childCount > 0)
									if (T1.GetChild(0).name == "highlightTip")
										T1.GetChild(0).GetComponent<Image>().enabled = false;
								ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_clasp);
							}
						}

					RecipocatingCC = T;
				}

				else if (Type == ComponentType.Mesh)
					MeshCC = T;
				else
					AddList.Add(T);
				// set to data in future



				break;
			}
		}


		ComponentSetList.Add(type);
		return;// Type;
	}

	/// <summary>
	/// Adds mesh
	/// </summary>
	/// <param name="type">Mesh to add</param>
	public void SetMesh(RPD_2DComponent.componentType type)
	{
		ComponentType Type = CheckType(type);


		foreach (Transform T in ComponentGameObject.transform)
		{

			if (type.ToString() == T.name)
			{
				if (Type == ComponentType.Mesh)
					RemoveMesh(); //remove old mesh before setting new mesh

				if (T.GetComponent<Image>())
					T.GetComponent<Image>().enabled = true;
				//if (T.GetComponent<PolygonCollider2D>())
				//T.GetComponent<PolygonCollider2D>().enabled = true;
				if (T.childCount > 0)
					if (T.GetChild(0).name == "highlightTip")
						T.GetChild(0).GetComponent<Image>().enabled = true;


				if (Type == ComponentType.Mesh)
					MeshCC = T;
				break;
			}
		}

		ComponentSetList.Add(type);
	}

	/// <summary>
	/// Removes all meshes
	/// </summary>
	public void RemoveMesh()
	{
		ComponentSetList.Remove(RPD_2DComponent.componentType.strip_mesh);
		ComponentSetList.Remove(RPD_2DComponent.componentType.tori_mesh);
		ComponentSetList.Remove(RPD_2DComponent.componentType.cross_mesh);
		ComponentSetList.Remove(RPD_2DComponent.componentType.hole_mesh);
		ComponentSetList.Remove(RPD_2DComponent.componentType.plate_mesh);
		ComponentSetList.Remove(RPD_2DComponent.componentType.flange);

		if (MeshCC != null)
		{
			RemoveDup(MeshCC);
			MeshCC = null;
		}
	}

	/// <summary>
	/// Removes bar retainers
	/// </summary>
	/// <returns>True if managed to remove Bar visuals, false otherwise</returns>
	public bool RemoveBar()
	{
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_I_distal);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_S_distal);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_Y_distal);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_T_distal);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_R_distal);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_I_mesial);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_S_mesial);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_U_mesial);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_Y_mesial);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_T_mesial);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_R_mesial);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_mid);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_end_distal);
		ComponentSetList.Remove(RPD_2DComponent.componentType.rb_end_mesial);

		if (BarCC != null)
		{
			RemoveDup(BarCC);
			BarCC = null;
			return true;
		}
		else
			return false;

	}

	/// <summary>
	/// Removes component
	/// </summary>
	/// <param name="type">Component to remove</param>
	/// <param name="ignoreRemoveList">Only used in legacy 2D system. If set to true, component visuals will be removed, but component will still stay. If set to false, both visuals and component will be removed</param>
	/// <param name="removeMeshOnlyFromThisTooth">Only used in legacy 2D system. If set to true and "type" is a mesh, will only remove mesh from this tooth rather than all adjacent meshes.</param>
	/// <returns></returns>
	public bool RemoveComponent(RPD_2DComponent.componentType type, bool ignoreRemoveList = false, bool removeMeshOnlyFromThisTooth = false)
	{
		if (RPDManager.instance.useNew2DSystem)
		{
			return ComponentSetList.Remove(type);
		}

		//check if setable
		if (ComponentGameObject == null)
			return false;

		ComponentType RemoveType = CheckType(type);

		if (RemoveType == ComponentType.Mesh)
		{
			if (!removeMeshOnlyFromThisTooth)
				BarLogic.instance.RemoveMesh(int.Parse(gameObject.transform.parent.name));
			else
				BarLogic.instance.RemoveMeshOnlyAt(int.Parse(gameObject.transform.parent.name));
		}

		if (RemoveType == ComponentType.Bar)
		{
			BarLogic.instance.RemoveBar(int.Parse(gameObject.transform.parent.name));

		}

		if (RemoveType == ComponentType.Clasp)
			ClaspCC = null;

		if (RemoveType == ComponentType.Recipocating)
		{
			ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_clasp);
			ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_plate);
			ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_crossmesh);
			RecipocatingCC = null;

		}


		if (RemoveType == ComponentType.Ring)
		{
			ComponentSetList.Remove(RPD_2DComponent.componentType.rr_mesiobuccal);
			ComponentSetList.Remove(RPD_2DComponent.componentType.rr_mesiolingual);
			ComponentSetList.Remove(RPD_2DComponent.componentType.rr_distobuccal);
			ComponentSetList.Remove(RPD_2DComponent.componentType.rr_distolingual);
			ComponentSetList.Remove(RPD_2DComponent.componentType.rr_distal);

			RingCC = null;

		}


		foreach (Transform T in ComponentGameObject.transform)
		{
			if (type.ToString().Contains("_reciprocating_clasp"))// == "reciprocating_clasp")
			{
				//changed the hierachy and the way the name is found
				if (type.ToString() == T.name)//+ "_reciprocating_clasp") type.ToString() == T.name)
				{
					print("placing clasp");
					//recipC = T.Find("reciprocating_clasp").gameObject;
					T.GetComponent<Image>().enabled = true;
					//recipC.GetComponent<PolygonCollider2D>().enabled = true;
					T.transform.GetChild(0).GetComponent<Image>().enabled = true;

					RecipocatingCC = T.transform;  //recipC.transform;
												   //CompType = RPD_2DComponent.componentType.reciprocating_clasp;
				}
				//foreach (Transform T1 in T)
				//{
				//	if (T1.name.Contains("_reciprocating_clasp")) //"reciprocating_clasp" == T1.name)
				//	{
				//		//T1.gameObject.SetActive(false);
				//		if (T1.GetComponent<Image>())
				//			T1.GetComponent<Image>().enabled = false;
				//		//if (T1.GetComponent<PolygonCollider2D>())
				//			//T1.GetComponent<PolygonCollider2D>().enabled = false;
				//		if (T1.childCount > 0)
				//			if (T1.GetChild(0).name == "highlightTip")
				//				T1.GetChild(0).GetComponent<Image>().enabled = false;

				//		ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_clasp);
				//	}
				//}
				continue;
			}

			if (type.ToString() == T.name)
			{
				if (T.GetComponent<Image>())
					T.GetComponent<Image>().enabled = false;
				//if (T.GetComponent<PolygonCollider2D>())
				//T.GetComponent<PolygonCollider2D>().enabled = false;
				if (T.childCount > 0)
					if (T.GetChild(0).name == "highlightTip")
						T.GetChild(0).GetComponent<Image>().enabled = false;

				// set to data in future


				//foreach (Transform T1 in T)
				//{
				//	if (T1.name.Contains("_reciprocating_clasp")) //"reciprocating_clasp" == T1.name)
				//	{
				//		//T1.gameObject.SetActive(false);
				//		if (T1.GetComponent<Image>())
				//			T1.GetComponent<Image>().enabled = false;
				//		//if (T1.GetComponent<PolygonCollider2D>())
				//			//T1.GetComponent<PolygonCollider2D>().enabled = false;
				//		if (T1.childCount > 0)
				//			if (T1.GetChild(0).name == "highlightTip")
				//				T1.GetChild(0).GetComponent<Image>().enabled = false;

				//		ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_clasp);
				//	}
				//}
			}
		}



		if (!ignoreRemoveList)
			return ComponentSetList.Remove(type);

		//catch-all return, returned value from here cannot be trusted
		//added this in as new 2D RPD system needs a return type
		//but old system does not
		return true;
	}

	/// <summary>
	/// Turns off component visuals on the supplied Transform
	/// </summary>
	/// <param name="T">Transform with the visuals</param>
	public void RemoveDup(Transform T)
	{
		if (T.GetComponent<Image>())
			T.GetComponent<Image>().enabled = false;
		//if (T.GetComponent<PolygonCollider2D>())
		//T.GetComponent<PolygonCollider2D>().enabled = false;
		if (T.childCount > 0)
			if (T.GetChild(0).name == "highlightTip")
				T.GetChild(0).GetComponent<Image>().enabled = false;

		//check for reciprocaring clasp
		foreach (Transform T1 in T)
		{
			if (T1.name.Contains("_reciprocating_clasp")) //"reciprocating_clasp" == T1.name)
			{
				//T1.gameObject.SetActive(false);
				if (T1.GetComponent<Image>())
					T1.GetComponent<Image>().enabled = false;
				//if (T1.GetComponent<PolygonCollider2D>())
				//T1.GetComponent<PolygonCollider2D>().enabled = false;
				if (T1.childCount > 0)
					if (T1.GetChild(0).name == "highlightTip")
						T1.GetChild(0).GetComponent<Image>().enabled = false;
				ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_clasp);
			}
		}
	}

	/// <summary>
	/// Legacy function. Checks if component is available.
	/// </summary>
	/// <param name="type">The component</param>
	/// <returns></returns>
	public bool CheckAvailbleComponent(RPD_2DComponent.componentType type)
	{
		if (ComponentGameObject == null)
			return false;

		foreach (var p in AvailableComponent)
			if (p == type)
				return true;

		return false;
	}

	/// <summary>
	/// Check if component is on this tooth
	/// </summary>
	/// <param name="componentsPresent">Out list of components that match the ones being checked for</param>
	/// <param name="types">Components to check for</param>
	/// <returns>True if any of the components being checked for are present, false otherwise</returns>
	public bool HasComponent(out List<RPD_2DComponent.componentType> componentsPresent, params RPD_2DComponent.componentType[] types)
	{
		componentsPresent = new List<RPD_2DComponent.componentType>();

		foreach (RPD_2DComponent.componentType component in types)
		{
			if (HasComponent(component))
				componentsPresent.Add(component);
		}

		if (componentsPresent.Count > 0)
			return true;
		else
			return false;
	}

	/// <summary>
	/// Check if component is on this tooth
	/// </summary>
	/// <param name="component">Component to check for</param>
	/// <returns>True if component is on this tooth, false otherwise</returns>
	public bool HasComponent(RPDComponent component)
	{
		return HasComponent(component.rpdComponent);
	}

	/// <summary>
	/// Check if component is on this tooth
	/// </summary>
	/// <param name="types">Components to check for</param>
	/// <returns>True if any of the components being checked for are present, false otherwise</returns>
	public bool HasComponent(params RPD_2DComponent.componentType[] types)
	{
		foreach (RPD_2DComponent.componentType component in types)
		{
			if (HasComponent(component))
				return true;
		}

		return false;
	}

	/// <summary>
	/// Check if component is on this tooth
	/// </summary>
	/// <param name="type">Component to check for</param>
	/// <returns>True if component is on this tooth, false otherwise</returns>
	public bool HasComponent(RPD_2DComponent.componentType type)
	{
		if (ComponentGameObject == null)
			return false;

		return ComponentSetList.Contains(type);
	}

	/// <summary>
	/// Legacy function. Checks for placed components, hides unused visuals, turns on used visuals
	/// </summary>
	[ContextMenu("Update Tooth")]
	public void UpdateTooth()
	{
		ToothIndex = ToothData.ti.major_index * 10 + ToothData.ti.minor_index;
		AvailableComponent.Clear();
		//set sprite
		foreach (Transform T in transform.GetChild(1))
		{
			if (T.name != ToothIndex.ToString())
			{
				T.GetComponent<Image>().enabled = false;
				//T.GetComponent<PolygonCollider2D>().enabled = false;
			}
			else
			{
				T.GetComponent<Image>().enabled = true;
				//T.GetComponent<PolygonCollider2D>().enabled = true;
			}
		}


		//Disable Component
		foreach (Transform T in transform.GetChild(2))
		{
			if (T.name == ToothIndex.ToString())
			{
				ComponentGameObject = T.gameObject;

				foreach (Transform T2 in T)
				{
					if (T2.name.Contains("_reciprocating_clasp"))
					{
						AvailableComponent.Add(RPD_2DComponent.componentType.reciprocating_clasp);
					}

					else
					{
						AvailableComponent.Add((RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), T2.name));
						//if (T2.GetComponent<Image>())
						//	T2.GetComponent<Image>().enabled = true;
					}
					//if (T2.GetComponent<PolygonCollider2D>())
					//    T2.GetComponent<PolygonCollider2D>().enabled = true;


				}
			}

			foreach (Transform T2 in T)
			{
				if (T2.GetComponent<Image>())
					T2.GetComponent<Image>().enabled = false;
				//if (T2.GetComponent<PolygonCollider2D>())
				//T2.GetComponent<PolygonCollider2D>().enabled = false;

				foreach (Transform T3 in T2)
				{
					if (T3.GetComponent<Image>())
						T3.GetComponent<Image>().enabled = false;
					//if (T3.GetComponent<PolygonCollider2D>())
					//T3.GetComponent<PolygonCollider2D>().enabled = false;
				}
			}
		}
	}

	public RPD_2DComponent.componentType DetectedNewComponent;
	bool removeMesh = false;
	void OnTriggerEnter2D(Collider2D collision)
	{

		if (collision.name == "DragUI_Item")
		{
			//Debug.LogError("DragUI_Item" + collision.GetComponent<UI_ComponentDrag>().compType);

			if (CheckType(collision.GetComponent<UI_ComponentDrag>().compType, true) == ComponentType.Bar)
			{
				if (BarLogic.instance.CheckBar(int.Parse(gameObject.transform.parent.name)))
				{
					DetectedNewComponent = collision.GetComponent<UI_ComponentDrag>().compType;
					collision.GetComponent<UI_ComponentDrag>().CanSet();
					GlobalHelper.instance.CurrentTooth = this;


					return;
				}
				else
				{
					collision.GetComponent<UI_ComponentDrag>().CannotSet();
					GlobalHelper.instance.CurrentTooth = null;
					return;
				}

			}
			if (presence == Tooth_Presence.present) // check mesh on tooth presence
			{
				if (collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.strip_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.tori_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.cross_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.hole_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.plate_mesh)
				{
					collision.GetComponent<UI_ComponentDrag>().CannotSet();
					GlobalHelper.instance.CurrentTooth = null;

					return;
				}
			}

			if (collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.reciprocating_clasp && ClaspCC != null)
			{
				DetectedNewComponent = collision.GetComponent<UI_ComponentDrag>().compType;
				collision.GetComponent<UI_ComponentDrag>().CanSet();
				GlobalHelper.instance.CurrentTooth = this;
				return;
			}

			if (!CheckAvailbleComponent(collision.GetComponent<UI_ComponentDrag>().compType))
			{
				collision.GetComponent<UI_ComponentDrag>().CannotSet();
				GlobalHelper.instance.CurrentTooth = null;
			}
			else if (presence == Tooth_Presence.missing)
			{
				if (collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.strip_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.tori_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.cross_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.hole_mesh ||
					collision.GetComponent<UI_ComponentDrag>().compType == RPD_2DComponent.componentType.plate_mesh)
				{
					DetectedNewComponent = collision.GetComponent<UI_ComponentDrag>().compType;
					collision.GetComponent<UI_ComponentDrag>().CanSet();
					GlobalHelper.instance.CurrentTooth = this;
					return;
				}
				else
				{
					collision.GetComponent<UI_ComponentDrag>().CannotSet();
					GlobalHelper.instance.CurrentTooth = null;
				}
			}

			else
			{
				DetectedNewComponent = collision.GetComponent<UI_ComponentDrag>().compType;
				collision.GetComponent<UI_ComponentDrag>().CanSet();
				GlobalHelper.instance.CurrentTooth = this;
			}

		}
	}


	/// <summary>
	/// Handles trying to place Mesh and Recip. Plate components
	/// Tries to place component referenced at UI_Component_Click.instance.currentComponent
	/// </summary>
	public void PlaceSelectedComponent()
	{
		RPDComponent component = UI_Component_Click.instance.currentComponent;

		if (component == null)
		{
			Logger.LogError(TypeLogError.General, "UI_Component_Click.instance.currentComponent is null, unable to set component");
			return;
		}

		bool success = RPDManager.instance.PlaceComponent(component, ToothIndex, out CriteriaFailureData failureData);

		if (success && component.GetType() == typeof(BarComponent))
		{
			//recalculate bar criteria for button display
			toothCompToggles.ToggleBarsBtn();
		}

		//ConnectorsLogic.instance.ReSetMajorConnectors(ToothIndex, false);
	}

	/// <summary>
	/// Handles clicks
	/// </summary>
	public void OnPointerClickCustom()
	{
		Debug.Log("Clicked on: " + gameObject.transform.parent.name);
		UI_Component_Click click = UI_Component_Click.instance;

		if (RPDManager.instance.useNew2DSystem)
		{
			//DetectedNewComponent = click.compType;
			//DetectChange();
			PlaceSelectedComponent();
			return;
		}

		if (CheckType(click.compType, true) == ComponentType.Bar)
		{
			if (BarLogic.instance.CheckBar(int.Parse(gameObject.transform.parent.name)))
			{
				DetectedNewComponent = click.compType;
				click.CanSet();
				GlobalHelper.instance.CurrentTooth = this;
				DetectChange();
				return;
			}
			else
			{
				DetectedNewComponent = RPD_2DComponent.componentType.TypeNull;
				click.CannotSet();
				GlobalHelper.instance.CurrentTooth = null;
				DetectChange();
				return;
			}

		}
		if (presence == Tooth_Presence.present) // check mesh on tooth presence
		{
			if (click.compType == RPD_2DComponent.componentType.strip_mesh ||
				click.compType == RPD_2DComponent.componentType.tori_mesh ||
				click.compType == RPD_2DComponent.componentType.cross_mesh ||
				click.compType == RPD_2DComponent.componentType.hole_mesh ||
				click.compType == RPD_2DComponent.componentType.plate_mesh ||
				click.compType == RPD_2DComponent.componentType.flange)
			{
				click.CannotSet();
				GlobalHelper.instance.CurrentTooth = null;
				DetectChange();
				return;
			}
		}

		if (click.compType == RPD_2DComponent.componentType.reciprocating_clasp && ClaspCC != null)
		{
			DetectedNewComponent = click.compType;
			click.CanSet();
			GlobalHelper.instance.CurrentTooth = this;
			DetectChange();
			return;
		}

		if (!CheckAvailbleComponent(click.compType))
		{
			click.CanSet();
			//click.CannotSet();
			GlobalHelper.instance.CurrentTooth = null;
		}
		else if (presence == Tooth_Presence.missing)
		{
			if (click.compType == RPD_2DComponent.componentType.strip_mesh ||
				click.compType == RPD_2DComponent.componentType.tori_mesh ||
				click.compType == RPD_2DComponent.componentType.cross_mesh ||
				click.compType == RPD_2DComponent.componentType.hole_mesh ||
				click.compType == RPD_2DComponent.componentType.plate_mesh ||
				click.compType == RPD_2DComponent.componentType.flange)
			{
				DetectedNewComponent = click.compType;
				click.CanSet();
				GlobalHelper.instance.CurrentTooth = this;
				DetectChange();
				return;
			}
			else
			{
				click.CannotSet();
				GlobalHelper.instance.CurrentTooth = null;
			}
		}

		else
		{
			DetectedNewComponent = click.compType;
			click.CanSet();
			GlobalHelper.instance.CurrentTooth = this;
			DetectChange();
			print("i have entered to place component");
		}

		DetectChange();
	}


	//on release
	/// <summary>
	/// Legacy function. Handles mouse release after drag
	/// </summary>
	public void OnPointerUp()
	{
		UI_ComponentDrag.Instance.CanSet();
		//Debug.LogError("Pointer Up");
		DetectChange();
	}

	private void OnTriggerExit2D(Collider2D collision)
	{
		//Debug.LogError("Trigger Exit" + DetectedNewComponent);

		//collision.GetComponent<UI_ComponentDrag>().CanSet();
		DetectedNewComponent = RPD_2DComponent.componentType.TypeNull;
	}

	/// <summary>
	/// Legacy function. Adds a bar component
	/// </summary>
	/// <param name="component">Bar component to add</param>
	public void SetBar(string component)
	{
		RPD_2DComponent.componentType temp = (RPD_2DComponent.componentType)System.Enum.Parse(typeof(RPD_2DComponent.componentType), component);

		DetectedNewComponent = temp;

		if (BarLogic.instance.CheckBar(int.Parse(transform.parent.name)))
		{
			print(this.name + int.Parse(transform.parent.name) + DetectedNewComponent);

			if (component.Contains("mesial"))
			{
				BarLogic.instance.SetBarLeft(int.Parse(transform.parent.name), DetectedNewComponent);
			}
			else
			{
				BarLogic.instance.SetBarRight(int.Parse(transform.parent.name), DetectedNewComponent);
			}
			//BarLogic.instance.SetNearestBar(int.Parse(transform.parent.name), DetectedNewComponent);
		}
	}

	/// <summary>
	/// Legacy function. Checks for and handles component changes on tooth
	/// </summary>
	public void DetectChange() // on mouse up
	{
		//Debug.LogError(DetectedNewComponent);
		if (DetectedNewComponent != RPD_2DComponent.componentType.TypeNull)
		{
			//Debug.LogError(DetectedNewComponent);
			if (GlobalHelper.instance.GetMouseDown())
			{

			}
			else
			{
				if (CheckType(DetectedNewComponent, true) == ComponentType.Bar && presence == Tooth_Presence.missing)
				{
					UI_Component_Click.instance.compType = RPD_2DComponent.componentType.TypeNull;
					DetectedNewComponent = RPD_2DComponent.componentType.TypeNull;
					//UI_Component_Click.instance.ResetToggles();

					return;
				}


				if (CheckType(DetectedNewComponent, true) == ComponentType.Bar)
				{
					// toggle Bar Bahviour
					//BarLogic.instance.SetBarLeft(int.Parse(transform.parent.name));
					if (BarLogic.instance.CheckBar(int.Parse(transform.parent.name)))
					{
						print(this.name + int.Parse(transform.parent.name) + DetectedNewComponent);
						BarLogic.instance.SetNearestBar(int.Parse(transform.parent.name), DetectedNewComponent);
					}

					//UI_Component_Click.instance.ResetToggles();
				}
				else
				{
					SetComponent(DetectedNewComponent);
				}
			}

			//check if the component is a Mesh or Bar type
			if (CheckType(DetectedNewComponent, true) == ComponentType.Bar)
			{
				UI_Component_Click.instance.compType = RPD_2DComponent.componentType.TypeNull;
				DetectedNewComponent = RPD_2DComponent.componentType.TypeNull;
				//UI_Component_Click.instance.ResetToggles();
			}
		}

		if (CheckType(DetectedNewComponent, true) == ComponentType.Bar)
		{
			DetectedNewComponent = RPD_2DComponent.componentType.TypeNull;
			UI_Component_Click.instance.compType = RPD_2DComponent.componentType.TypeNull;
			//UI_Component_Click.instance.ResetToggles();
		}
	}

	/// <summary>
	/// Legacy function. Ends mesh placement mode
	/// </summary>
	public void EndMeshPlacementMode()
	{
		//print("EndMeshMode");

		DetectedNewComponent = RPD_2DComponent.componentType.TypeNull;

		UI_Component_Click.instance.compType = RPD_2DComponent.componentType.TypeNull;
		UI_Component_Click.instance.currentComponent = null;
		//UI_Component_Click.instance.ResetToggles();
		//Stage4_PanelControl.instance.EnablePanels();
	}

	/// <summary>
	/// Legacy function. Converts RPD_2DComponent.componentType to ComponentType
	/// </summary>
	/// <param name="type"></param>
	/// <param name="isIgnoreRemoveDup"></param>
	/// <returns></returns>
	ComponentType CheckType(RPD_2DComponent.componentType type, bool isIgnoreRemoveDup = false)
	{

		ComponentType NewType;

		if (type == RPD_2DComponent.componentType.rc_mesiobuccal ||
			type == RPD_2DComponent.componentType.rc_mesiolingual ||
			type == RPD_2DComponent.componentType.rc_distobuccal ||
			type == RPD_2DComponent.componentType.rc_distolingual ||
			type == RPD_2DComponent.componentType.rr_mesiobuccal ||
			type == RPD_2DComponent.componentType.rr_mesiolingual ||
			type == RPD_2DComponent.componentType.rr_distobuccal ||
			type == RPD_2DComponent.componentType.rr_distolingual)
			NewType = ComponentType.Clasp;
		else if (
			type == RPD_2DComponent.componentType.rr_mesiobuccal ||
	   type == RPD_2DComponent.componentType.rr_mesiolingual ||
		type == RPD_2DComponent.componentType.rr_distobuccal ||
		type == RPD_2DComponent.componentType.rr_distolingual ||
		type == RPD_2DComponent.componentType.rr_distal)
			NewType = ComponentType.Ring;
		else if (
			 type == RPD_2DComponent.componentType.rb_I_distal ||
		 type == RPD_2DComponent.componentType.rb_S_distal ||
		type == RPD_2DComponent.componentType.rb_U_distal ||
		 type == RPD_2DComponent.componentType.rb_Y_distal ||
		 type == RPD_2DComponent.componentType.rb_T_distal ||
		 type == RPD_2DComponent.componentType.rb_R_distal ||
		 type == RPD_2DComponent.componentType.rb_I_mesial ||
		 type == RPD_2DComponent.componentType.rb_S_mesial ||
		 type == RPD_2DComponent.componentType.rb_U_mesial ||
		 type == RPD_2DComponent.componentType.rb_Y_mesial ||
		 type == RPD_2DComponent.componentType.rb_T_mesial ||
		 type == RPD_2DComponent.componentType.rb_R_mesial ||
		 type == RPD_2DComponent.componentType.rb_mid ||
		 type == RPD_2DComponent.componentType.rb_end_distal ||
		 type == RPD_2DComponent.componentType.rb_end_mesial)
			NewType = ComponentType.Bar;
		else if (
			 type == RPD_2DComponent.componentType.reciprocating_clasp ||
		type == RPD_2DComponent.componentType.reciprocating_plate ||
		type == RPD_2DComponent.componentType.reciprocating_crossmesh)
			NewType = ComponentType.Recipocating;


		else if (
			type == RPD_2DComponent.componentType.cross_mesh ||
			type == RPD_2DComponent.componentType.hole_mesh ||
			type == RPD_2DComponent.componentType.plate_mesh ||
			type == RPD_2DComponent.componentType.strip_mesh ||
			type == RPD_2DComponent.componentType.tori_mesh ||
			type == RPD_2DComponent.componentType.flange)
			NewType = ComponentType.Mesh;
		else
			NewType = ComponentType.Null;

		if (!isIgnoreRemoveDup)
		{
			if (NewType == ComponentType.Clasp && ClaspCC != null)
			{
				ComponentSetList.Remove(RPD_2DComponent.componentType.rc_mesiobuccal);
				ComponentSetList.Remove(RPD_2DComponent.componentType.rc_mesiolingual);
				ComponentSetList.Remove(RPD_2DComponent.componentType.rc_distobuccal);
				ComponentSetList.Remove(RPD_2DComponent.componentType.rc_distolingual);
				ComponentSetList.Remove(RPD_2DComponent.componentType.rr_mesiobuccal);
				ComponentSetList.Remove(RPD_2DComponent.componentType.rr_mesiolingual);
				ComponentSetList.Remove(RPD_2DComponent.componentType.rr_distobuccal);
				ComponentSetList.Remove(RPD_2DComponent.componentType.rr_distolingual);
				RemoveDup(ClaspCC);
			}

			else if (NewType == ComponentType.Ring && RingCC != null)
				RemoveDup(RingCC);
			else if (NewType == ComponentType.Bar && BarCC != null)
				RemoveDup(BarCC);

			else if (NewType == ComponentType.Recipocating && RecipocatingCC != null)
			{
				ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_clasp);
				ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_plate);
				ComponentSetList.Remove(RPD_2DComponent.componentType.reciprocating_crossmesh);
				RemoveDup(RecipocatingCC);
			}

			else if (NewType == ComponentType.Mesh && MeshCC != null)
				RemoveDup(MeshCC);
		}

		return NewType;
	}

	/// <summary>
	/// Clears all components that are on this tooth
	/// </summary>
	public void Reset()
	{
		if (ClaspCC != null)
			RemoveDup(ClaspCC);
		if (RingCC != null)
			RemoveDup(RingCC);
		if (BarCC != null)
			RemoveDup(BarCC);
		if (RecipocatingCC != null)
			RemoveDup(RecipocatingCC);
		if (MeshCC != null)
			RemoveDup(MeshCC);

		foreach (var item in AddList)
		{
			RemoveDup(item);
		}

		//foreach (var component in AddList)
		//{
		//	RPDManager.instance.RemoveComponent(component.GetComponent<ComponentSelect>().rpdComponent, ToothIndex);
		//}

		AddList.Clear();
		ComponentSetList.Clear();

		ClaspCC = RingCC = BarCC = RecipocatingCC = MeshCC = null;
	}

	/// <summary>
	/// Legacy function. Checks if mesh is present on this tooth
	/// </summary>
	/// <returns></returns>
	public bool CheckMeshPresent()
	{
		return MeshCC != null;
	}

	/// <summary>
	/// Generates ConnectorData
	/// </summary>
	/// <returns>Generated ConnectorData</returns>
	public ConnectorData GetConnectorData()
	{
		ConnectorData Data = new ConnectorData();

		if (presence == Tooth_Presence.present)
			Data.presence = true;
		else
			Data.presence = false;

		if (RPDManager.instance.useNew2DSystem)
		{
			Data.isMesh = HasComponent(Constants.Components.Meshes);
		}
		else
		{
			if (MeshCC != null)
				Data.isMesh = true;
			else
				Data.isMesh = false;
		}

		if (ComponentSetList.Count > 0)
			Data.isComponentPresent = true;
		else
			Data.isComponentPresent = false;



		foreach (var comp in ComponentSetList)
		{
			ComponentType type = CheckType(comp, true);


			if (comp == RPD_2DComponent.componentType.ac_full || comp == RPD_2DComponent.componentType.reciprocating_plate || comp == RPD_2DComponent.componentType.reciprocating_crossmesh)
			{
				Data.isDistoComp = true;
				Data.isMiseolComp = true;
			}

			else if (type != ComponentType.Mesh &&
				type != ComponentType.Recipocating &&
				comp != RPD_2DComponent.componentType.rb_bar_end_mesial && comp != RPD_2DComponent.componentType.rb_end_distal && comp != RPD_2DComponent.componentType.rb_end_mesial && comp != RPD_2DComponent.componentType.rb_mid
				&& comp != RPD_2DComponent.componentType.ac_full)
			{
				if (isMesio(comp))
					Data.isMiseolComp = true;
				else
					Data.isDistoComp = true;
			}

			else
			{
				Data.isDistoComp = false;
				Data.isMiseolComp = false;
			}
		}

		return Data;
	}

	/// <summary>
	/// Legacy function. Checks if component is a mesial component
	/// </summary>
	/// <param name="type"></param>
	/// <returns></returns>
	bool isMesio(RPD_2DComponent.componentType type)
	{
		if (type == RPD_2DComponent.componentType.ac_mesial ||
			type == RPD_2DComponent.componentType.ai_mesial ||
			type == RPD_2DComponent.componentType.p_mesial ||
			//type == RPD_2DComponent.componentType.rb_bar_end_mesial ||
			//type == RPD_2DComponent.componentType.rb_end_mesial ||
			type == RPD_2DComponent.componentType.rb_I_mesial ||
			type == RPD_2DComponent.componentType.rb_S_mesial ||
			type == RPD_2DComponent.componentType.rb_U_mesial ||
			type == RPD_2DComponent.componentType.rb_Y_mesial ||
			type == RPD_2DComponent.componentType.rb_T_mesial ||
			//type == RPD_2DComponent.componentType.rc_mesiobuccal || < is actually distal component as tip is at mesial
			type == RPD_2DComponent.componentType.rc_distobuccal || // < is actually mesial component as tip is at Distal (aka origin is at mesial)
																	//type == RPD_2DComponent.componentType.rc_mesiolingual || < is actually distal component as tip is at mesial
			type == RPD_2DComponent.componentType.rc_distolingual || //< is actually mesial component as tip is at Distal(aka origin is at mesial)
																	 //type == RPD_2DComponent.componentType.rr_distobuccal ||
																	 //type == RPD_2DComponent.componentType.rr_distolingual
			type == RPD_2DComponent.componentType.rr_mesiobuccal ||
			type == RPD_2DComponent.componentType.rr_mesiolingual
			)
			return true;
		else
			return false;
	}

	/// <summary>
	/// Sets up tooth as missing
	/// </summary>
	public void SetToothMissing()
	{
		presence = Tooth_Presence.missing;

		//set tooth sprite
		foreach (Transform T in transform.GetChild(1))
		{
			Color temp = T.GetComponent<Image>().color;
			temp.a = 0;
			T.GetComponent<Image>().color = temp;
			//T.GetComponent<PolygonCollider2D>().enabled = true;
		}
	}

	/// <summary>
	/// Sets up tooth as present
	/// </summary>
	[ContextMenu("setTooth")]
	public void SetTooth()
	{
		//print("tooth set");

		presence = Tooth_Presence.present;

		//set tooth sprite
		foreach (Transform T in transform.GetChild(1))
		{
			Color temp = T.GetComponent<Image>().color;
			temp.a = 1;
			T.GetComponent<Image>().color = temp;
			//T.GetComponent<PolygonCollider2D>().enabled = true;
			//print("tooth img set");
		}
	}

	//SetTooth presence for 2D solo mode
	/// <summary>
	/// Sets whether tooth is present, also sets presence on jaw struct
	/// </summary>
	/// <param name="isPresent">Tooth presence</param>
	/// <param name="arrayInt">Tooth patch ID</param>
	public void SetToothPresentToJaw(bool isPresent, int arrayInt)
	{
		if (isPresent)
		{
			//ToothData.ti.tooth_presence = Tooth_Presence.present;
			SetTooth();
			//DLLIntegration.instance.jUpper.tooth[ToothData.ti.array_index].ti.tooth_presence = (int)ToothData.ti.tooth_presence;
			SendToJaw(arrayInt);

			OnPresenceChanged?.Invoke(ToothIndex, true);
		}

		else
		{
			//ToothData.ti.tooth_presence = Tooth_Presence.missing;
			SetToothMissing();
			SendToJaw(arrayInt);

			OnPresenceChanged?.Invoke(ToothIndex, false);
		}
	}

	/// <summary>
	/// Sets tooth presence on the jaw struct
	/// </summary>
	/// <param name="arrayInt">Tooth patch ID</param>
	public void SendToJaw(int arrayInt)
	{
		if (ToothIndex < 30)
		{
			//Debug.LogError(DLLIntegration.instance.jUpper.tooth[ToothData.ti.array_index].ti.array_index + " " + ToothIndex);

			DLLIntegration.instance.jUpper.tooth[arrayInt].ti.tooth_presence = (int)presence; //ToothData.ti.tooth_presence;

			//Debug.LogError(DLLIntegration.instance.jUpper.tooth[arrayInt].ti.tooth_presence + " < DLLInt presencce vs generictooth presence >  " + presence);
		}

		else
		{
			DLLIntegration.instance.jLower.tooth[arrayInt].ti.tooth_presence = (int)presence;// ToothData.ti.tooth_presence;
		}
	}

	#region Tooth Condition Functions

	[SerializeField]
	public Tooth_Condition condition = Tooth_Condition.normal;

	public event System.Action<int, Tooth_Condition> OnConditionChanged;

	/// <summary>
	/// Sets tooth condition to normal
	/// </summary>
	public void SetToothNormal()
	{
		condition = Tooth_Condition.normal;

		// Visual changes can be handled by ToothConditionManager
		// This function focuses on data state only
	}

	/// <summary>
	/// Sets tooth condition to abutment
	/// </summary>
	public void SetToothAbutment()
	{
		condition = Tooth_Condition.abutment;

		// Visual changes can be handled by ToothConditionManager
		// This function focuses on data state only
	}

	/// <summary>
	/// Sets tooth condition to compromise
	/// </summary>
	public void SetToothCompromise()
	{
		condition = Tooth_Condition.compromise;

		// Visual changes can be handled by ToothConditionManager
		// This function focuses on data state only
	}

	/// <summary>
	/// Sets tooth condition based on ToothConditionManager.ConditionMode, also sets condition on jaw struct
	/// </summary>
	/// <param name="newCondition">New tooth condition</param>
	/// <param name="arrayInt">Tooth patch ID</param>
	public void SetToothConditionToJaw(Tooth_Condition newCondition, int arrayInt)
	{
		switch (newCondition)
		{
			case Tooth_Condition.normal:
				SetToothNormal();
				break;
			case Tooth_Condition.abutment:
				SetToothAbutment();
				break;
			case Tooth_Condition.compromise:
				SetToothCompromise();
				break;
		}

		SendConditionToJaw(arrayInt);
		OnConditionChanged?.Invoke(ToothIndex, newCondition);
	}

	/// <summary>
	/// Sets tooth condition on the jaw struct
	/// </summary>
	/// <param name="arrayInt">Tooth patch ID</param>
	public void SendConditionToJaw(int arrayInt)
	{
		if (ToothIndex < 30)
		{
			DLLIntegration.instance.jUpper.tooth[arrayInt].ti.tooth_condition = (int)condition;
		}
		else
		{
			DLLIntegration.instance.jLower.tooth[arrayInt].ti.tooth_condition = (int)condition;
		}
	}

	/// <summary>
	/// Gets the current tooth condition from the jaw struct
	/// </summary>
	/// <param name="arrayInt">Tooth patch ID</param>
	/// <returns>Current tooth condition</returns>
	public Tooth_Condition GetToothConditionFromJaw(int arrayInt)
	{
		int conditionValue;

		if (ToothIndex < 30)
		{
			conditionValue = DLLIntegration.instance.jUpper.tooth[arrayInt].ti.tooth_condition;
		}
		else
		{
			conditionValue = DLLIntegration.instance.jLower.tooth[arrayInt].ti.tooth_condition;
		}

		return (Tooth_Condition)conditionValue;
	}

	/// <summary>
	/// Syncs the local condition variable with the jaw struct
	/// </summary>
	/// <param name="arrayInt">Tooth patch ID</param>
	public void SyncConditionFromJaw(int arrayInt)
	{
		condition = GetToothConditionFromJaw(arrayInt);
	}

	/// <summary>
	/// Toggles tooth condition based on current ToothConditionManager mode
	/// </summary>
	/// <param name="mode">The condition mode to toggle</param>
	/// <param name="arrayInt">Tooth patch ID</param>
	public void ToggleToothCondition(ToothConditionManager.ConditionMode mode, int arrayInt)
	{
		switch (mode)
		{
			case ToothConditionManager.ConditionMode.Abutment:
				Tooth_Condition newAbutmentCondition = (condition == Tooth_Condition.abutment) ?
					Tooth_Condition.normal : Tooth_Condition.abutment;
				SetToothConditionToJaw(newAbutmentCondition, arrayInt);
				break;

			case ToothConditionManager.ConditionMode.Compromised:
				Tooth_Condition newCompromiseCondition = (condition == Tooth_Condition.compromise) ?
					Tooth_Condition.normal : Tooth_Condition.compromise;
				SetToothConditionToJaw(newCompromiseCondition, arrayInt);
				break;

			case ToothConditionManager.ConditionMode.Presence:
				// Presence mode doesn't change condition, only presence
				// This could be handled separately or ignored
				break;
		}
	}

	#endregion
}
