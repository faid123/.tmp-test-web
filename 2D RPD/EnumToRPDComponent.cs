using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class EnumToRPDComponent : MonoBehaviour
{
	public static EnumToRPDComponent instance;

	[Header("Retainers")]
	[SerializeField] RetainerClaspComponent[] retainerClasps;
	[SerializeField] RetainerRingComponent[] retainerRings;
	[SerializeField] RetainerBarComponent[] retainerBars;

	[Header("Reciprocating")]
	[SerializeField] ReciprocatingComponent[] reciprocatingComponents;

	[Header("Rests")]
	[SerializeField] AnteriorCingulumRestComponent[] anteriorCingulumRests;
	[SerializeField] AnteriorIncisalRestComponent[] anteriorIncisalRests;
	[SerializeField] PosteriorRestTypeComponent[] posteriorRestTypes;
	[SerializeField] PosteriorRestPositionComponent[] posteriorRestPositions;

	[Header("Meshes")]
	[SerializeField] MeshComponent[] meshes;

	private void Awake()
	{
		if (instance == null)
			instance = this;
	}

	#region Get Functions
	//retainers
	/// <summary>
	/// Checks if given retainer clasp type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="retainerType">Input of retainer clasp type</param>
	/// <returns>rpdComponent entry</returns>
	public RPDComponent GetRPDComponentFromEnum(Retainer_Clasp_type retainerType)
	{
		foreach (RetainerClaspComponent entry in retainerClasps)
		{
			if (entry.retainerType == retainerType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {retainerType}.");

		return null;
	}
	/// <summary>
	/// Checks if given retainer ring type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="retainerType">Input of retainer ring type</param>
	/// <returns>rpdComponent entry</returns>
	public RPDComponent GetRPDComponentFromEnum(Retainer_Ring_type retainerType)
	{
		foreach (RetainerRingComponent entry in retainerRings)
		{
			if (entry.retainerType == retainerType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {retainerType}.");

		return null;
	}
	/// <summary>
	/// Checks if given retainer bar type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="retainerType">Input of retainer bar type</param>
	/// <returns>rpdComponent entry</returns>
	public RPDComponent GetRPDComponentFromEnum(Retainer_Bar_Category retainerType)
	{
		foreach (RetainerBarComponent entry in retainerBars)
		{
			if (entry.retainerType == retainerType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {retainerType}.");

		return null;
	}
	/// <summary>
	/// Checks if given anterior cingulum rest type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="restType">Input of anterior cingulum rest type</param>
	/// <returns>rpdComponent entry</returns>
	//rests
	public RPDComponent GetRPDComponentFromEnum(Anterior_Cingulum_Rest_Type restType)
	{
		foreach (AnteriorCingulumRestComponent entry in anteriorCingulumRests)
		{
			if (entry.restType == restType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {restType}.");

		return null;
	}
	/// <summary>
	/// Checks if given anterior incisal rest type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="restType">Input of anterior incisal rest type</param>
	/// <returns>rpdComponent entry</returns>
	public RPDComponent GetRPDComponentFromEnum(Anterior_Incisal_Rest_Type restType)
	{
		foreach (AnteriorIncisalRestComponent entry in anteriorIncisalRests)
		{
			if (entry.restType == restType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {restType}.");

		return null;
	}
	/// <summary>
	/// Checks if given posterior rest type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="restType">Input of posterior rest type</param>
	/// <returns>rpdComponent entry</returns>
	public RPDComponent GetRPDComponentFromEnum(Posterior_Rest_Type restType)
	{
		foreach (PosteriorRestTypeComponent entry in posteriorRestTypes)
		{
			if (entry.restType == restType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {restType}.");

		return null;
	}
	/// <summary>
	/// Checks if given rest position is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="restType">Input of posterior rest position type</param>
	/// <returns>rpdComponent entry</returns>
	public RPDComponent GetRPDComponentFromEnum(Posterior_Rest_Position restType)
	{
		foreach (PosteriorRestPositionComponent entry in posteriorRestPositions)
		{
			if (entry.restType == restType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {restType}.");

		return null;
	}
	/// <summary>
	/// Checks if given mesh type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="meshType">Input of mesh type</param>
	/// <returns>rpdComponent entry</returns>
	//meshes
	public RPDComponent GetRPDComponentFromEnum(Mesh_Type meshType)
	{
		foreach (MeshComponent entry in meshes)
		{
			if (entry.meshType == meshType)
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {meshType}.");

		return null;
	}
	/// <summary>
	/// Checks if given reciprocating (plate or clasp) type is supported. If it is, return rpdComponent entry.
	/// </summary>
	/// <param name="reciprocatingType">Input of reciprocating (plate or clasp) type</param>
	/// <param name="toothFDIID">Input of tooth index</param>
	/// <returns>rpdComponent entry</returns>
	public RPDComponent GetRPDComponentFromEnum(Reciprocating_Type reciprocatingType, int toothFDIID)
	{
		//to handle recip plates
		if (reciprocatingType == Reciprocating_Type.reciprocating_plate)
			foreach (ReciprocatingComponent entry in reciprocatingComponents)
			{
				if (entry.reciprocatingType == reciprocatingType)
					return entry.rpdComponent;
			}

		if (reciprocatingType == Reciprocating_Type.reciprocating_crossmesh)
			foreach (ReciprocatingComponent entry in reciprocatingComponents)
			{
				if (entry.reciprocatingType == reciprocatingType)
					return entry.rpdComponent;
			}

		//handle recip clasps, we assume that recip clasps are the last to be placed, so corresponding clasps should already be placed
		//we just return the clasp that is pointing in the same mesial/distal direction
		//currently is just a workaround that has to be done
		GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(toothFDIID);

		string direction = "";
		string side = "";

		if (tooth.HasComponent(RPD_2DComponent.componentType.rc_distobuccal))
		{
			direction = "disto";
			side = "lingual";
		}
		else if (tooth.HasComponent(RPD_2DComponent.componentType.rc_distolingual))
		{
			direction = "disto";
			side = "buccal";
		}
		else if (tooth.HasComponent(RPD_2DComponent.componentType.rc_mesiobuccal))
		{
			direction = "mesio";
			side = "lingual";
		}
		else if (tooth.HasComponent(RPD_2DComponent.componentType.rc_mesiolingual))
		{
			direction = "mesio";
			side = "buccal";
		}

		foreach (ReciprocatingComponent entry in reciprocatingComponents)
		{
			if (entry.rpdComponent.displayName.ToLower().Contains(direction) && entry.rpdComponent.displayName.ToLower().Contains(side))
				return entry.rpdComponent;
		}

		Logger.LogError(TypeLogError.RPD2D, $"Unable to find RPD Component to handle component enum {reciprocatingType}.");

		return null;
	}
	#endregion

	#region Data Classes
	//retainers
	[System.Serializable]
	public class RetainerClaspComponent
	{
		public Retainer_Clasp_type retainerType;
		public RPDComponent rpdComponent;
	}

	[System.Serializable]
	public class RetainerRingComponent
	{
		public Retainer_Ring_type retainerType;
		public RPDComponent rpdComponent;
	}

	[System.Serializable]
	public class RetainerBarComponent
	{
		public Retainer_Bar_Category retainerType;
		public RPDComponent rpdComponent;
	}

	//reciprocating
	[System.Serializable]
	public class ReciprocatingComponent
	{
		public Reciprocating_Type reciprocatingType;
		public RPDComponent rpdComponent;
	}

	//rests
	[System.Serializable]
	public class AnteriorCingulumRestComponent
	{
		public Anterior_Cingulum_Rest_Type restType;
		public RPDComponent rpdComponent;
	}

	[System.Serializable]
	public class AnteriorIncisalRestComponent
	{
		public Anterior_Incisal_Rest_Type restType;
		public RPDComponent rpdComponent;
	}

	[System.Serializable]
	public class PosteriorRestTypeComponent
	{
		public Posterior_Rest_Type restType;
		public RPDComponent rpdComponent;
	}

	[System.Serializable]
	public class PosteriorRestPositionComponent
	{
		public Posterior_Rest_Position restType;
		public RPDComponent rpdComponent;
	}

	//meshes
	[System.Serializable]
	public class MeshComponent
	{
		public Mesh_Type meshType;
		public RPDComponent rpdComponent;
	}
	#endregion
}
